import crypto from 'node:crypto';
import { ethers } from 'ethers';
import { explainDecision } from './policyService.js';
import { decodeContractError, serializeSnapshot } from './chainService.js';
import { approvalTypedData, recoverApprover, intentIdFor } from '../lib/approval.js';
import { grantTypedData } from '../lib/schedule.js';

/**
 * v2 only, before a signature exists: checkTransfer measures the limit checks; this covers the rest of a
 * signed execution (EIP-712 hashing and signature recovery, state writes, the transfer and its event).
 * Measured on a local chain (2026-10-17, ETH): checkTransfer ~40.9k; executeApprovedTransfer 109.3k used;
 * a first executeGrantTransfer run 143.4k used (two new grant-counter slots). The allowance covers the grant
 * case. It is display only: the executor always re-estimates the exact signed call before sending.
 */
const V2_SIGNED_EXECUTION_GAS_ALLOWANCE = 105_000n;
import { normalizeAddress, sameAddress } from '../lib/address.js';
import { parseAmount, formatAmount } from '../lib/units.js';
import { Mutex } from '../lib/mutex.js';
import { nowSeconds } from '../lib/time.js';
import { badRequest, conflict, notFound, unauthorized, unprocessable, AppError } from '../lib/errors.js';

/**
 * Proposal lifecycle (every transition is an atomic compare-and-set in the database):
 *
 *   created ──policy fails──▶ POLICY_REJECTED
 *      │
 *      ▼
 *   AWAITING_APPROVAL ──operator──▶ REJECTED
 *      │        └──────TTL──────▶ EXPIRED
 *      │ owner EIP-712 signature + fresh policy re-check
 *      ▼
 *   APPROVED ──executor──▶ SUBMITTED ──receipt verified──▶ CONFIRMED
 *      └──────────────┴──preflight / revert / drop──▶ FAILED
 */
export function createProposalService({ config, repos, chain, auth, risk, logger }) {
  const approvalMutex = new Mutex();
  let executor = null;

  function setExecutor(e) {
    executor = e;
  }

  function resolveToken(address) {
    const normalized = normalizeAddress(address, 'token', { allowZero: true });
    const token = chain.findToken(normalized);
    if (!token) throw badRequest('UNSUPPORTED_TOKEN', `Token ${normalized} is not supported on this deployment`);
    return token;
  }

  /**
   * Static call from the executor address against fresh chain state.
   *  - v1: the real executeTransfer call.
   *  - v2 with an owner signature or a task grant: the exact signed call the executor will send, so the
   *    contract's own signature, deadline and grant checks are part of the simulation.
   *  - v2 before anything is signed: simulateTransfer, which runs every limit check AND the real send, then
   *    always reverts (SimulationSucceeded() means it would succeed). It cannot be estimated, so the gas figure
   *    is checkTransfer's estimate plus a fixed allowance, labelled as a pre-signature estimate.
   */
  async function simulate(p, auth = null) {
    if (!config.executor.enabled) return { success: false, error: { name: 'ExecutorDisabled', args: [] } };
    const from = config.executor.address;
    const plain = [p.intentId, p.token.address, p.recipient, BigInt(p.amountWei)];
    let method;
    let args;
    let basis = 'exact';
    if (chain.contractVersion() === 1) {
      [method, args] = ['executeTransfer', plain];
    } else if (auth?.kind === 'OWNER_SIGNATURE') {
      [method, args] = ['executeApprovedTransfer', [approvalTypedData(p).message, auth.signature]];
    } else if (auth?.kind === 'TASK_GRANT') {
      [method, args] = ['executeGrantTransfer', [grantTypedData(auth.task).message, auth.task.grantSignature, p.intentId]];
    } else {
      [method, args, basis] = ['checkTransfer', plain, 'pre-signature'];
    }
    const target = method === 'executeTransfer' ? chain.executionContract() : chain.contract;
    try {
      let gasEstimate;
      if (basis === 'pre-signature') {
        await expectSimulationSucceeded(plain, from);
        gasEstimate = (await target.checkTransfer.estimateGas(...plain, { from })) + V2_SIGNED_EXECUTION_GAS_ALLOWANCE;
        method = 'simulateTransfer';
      } else {
        await target[method].staticCall(...args, { from });
        gasEstimate = await target[method].estimateGas(...args, { from });
      }
      const feeData = await chain.provider.getFeeData();
      const feePerGas = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
      return {
        success: true,
        method,
        gasBasis: basis,
        gasEstimate: gasEstimate.toString(),
        maxFeePerGas: feePerGas.toString(),
        maxNetworkFeeWei: (gasEstimate * feePerGas).toString(),
        maxNetworkFeeEth: ethers.formatEther(gasEstimate * feePerGas),
        simulatedAt: nowSeconds(),
      };
    } catch (err) {
      return { success: false, error: decodeContractError(err) || { name: 'SimulationFailed', args: [], message: err.shortMessage || err.message }, simulatedAt: nowSeconds() };
    }
  }

  /** v2 simulateTransfer always reverts; only SimulationSucceeded() means the transfer would go through. */
  async function expectSimulationSucceeded(args, from) {
    try {
      await chain.contract.simulateTransfer.staticCall(...args, { from });
    } catch (err) {
      if (decodeContractError(err)?.name === 'SimulationSucceeded') return;
      throw err;
    }
    throw new Error('simulateTransfer returned without its SimulationSucceeded marker');
  }

  /** Centralized risk assessment + static simulation against fresh chain state. */
  async function assess(p, { excludeId = null, auth = null } = {}) {
    const { policy } = await risk.assessTransfer({
      tokenAddress: p.token.address,
      recipient: p.recipient,
      amountWei: p.amountWei,
      excludeId,
      source: p.source,
    });
    let simulation = null;
    if (policy.passed) {
      simulation = await simulate(p, auth);
      const label = simulation.success ? `Static call succeeded; gas estimate ${simulation.gasEstimate}` : `Static call reverted: ${simulation.error?.name || 'unknown'}`;
      policy.checks.push({ id: 'SIMULATION', passed: simulation.success, message: label });
      if (!simulation.success) {
        policy.passed = false;
        policy.violations.push({ id: 'SIMULATION', message: label });
      }
    }
    return { policy, simulation };
  }

  async function create({ tokenAddress, recipient, amount, memo, source = 'MANUAL', decisionId = null, taskRunId = null, amountWeiOverride = null, idOverride = null }, actor) {
    const token = resolveToken(tokenAddress);
    const to = normalizeAddress(recipient, 'recipient');
    const amountWei = amountWeiOverride !== null ? BigInt(amountWeiOverride) : parseAmount(amount, token.decimals);
    if (amountWei <= 0n) throw badRequest('INVALID_AMOUNT', 'Amount must be greater than zero');

    const id = idOverride || crypto.randomUUID();
    if (idOverride) {
      const existing = await repos.proposals.findById(id);
      if (existing) {
        if (!sameAddress(existing.recipient,to) || existing.amountWei!==amountWei.toString() || !sameAddress(existing.token.address,token.address) || existing.createdBy!==actor) throw conflict('TREASURY_PROPOSAL_MISMATCH','Existing treasury proposal differs from this obligation');
        return existing;
      }
    }
    const draft = {
      id,
      intentId: intentIdFor({ chainId: config.chainId, contractAddress: config.contractAddress, proposalId: id }),
      source,
      decisionId,
      createdBy: actor,
      chainId: config.chainId,
      contractAddress: config.contractAddress,
      token: { address: token.address, symbol: token.symbol, decimals: token.decimals },
      recipient: to,
      amountWei: amountWei.toString(),
      memo: memo || null,
      taskRunId,
      expiresAt: nowSeconds() + config.proposalTtlSeconds,
    };
    const { policy, simulation } = await assess(draft);
    const proposal = await repos.proposals.insert({
      ...draft,
      status: policy.passed ? 'AWAITING_APPROVAL' : 'POLICY_REJECTED',
      policyResult: policy,
      simulation,
      explanation: explainDecision({ policy }),
    });
    await repos.audit.append({
      actor,
      action: policy.passed ? 'PROPOSAL_CREATED' : 'PROPOSAL_POLICY_REJECTED',
      entityType: 'proposal',
      entityId: id,
      details: { source, token: token.symbol, recipient: to, amountWei: draft.amountWei, violations: policy.violations },
    });
    return proposal;
  }

  async function get(id) {
    const proposal = await repos.proposals.findById(id);
    if (!proposal) throw notFound('Proposal not found');
    return decorate(proposal);
  }

  async function decorate(proposal) {
    const execution = await repos.executions.findByProposal(proposal.id);
    return {
      ...proposal,
      amountFormatted: formatAmount(proposal.amountWei, proposal.token.decimals),
      execution: execution ? { ...execution, explorerUrl: chain.txUrl(execution.txHash) } : null,
      approvalTypedData: proposal.status === 'AWAITING_APPROVAL' ? approvalTypedData(proposal) : null,
    };
  }

  async function list({ status, limit }) {
    const rows = await repos.proposals.list({ status, limit });
    return Promise.all(rows.map(decorate));
  }

  async function approve(id, { signature }, session) {
    await auth.assertOwner(session.address);
    return approvalMutex.run(async () => {
      const proposal = await repos.proposals.findById(id);
      if (!proposal) throw notFound('Proposal not found');
      if (proposal.status !== 'AWAITING_APPROVAL') {
        throw conflict('INVALID_STATE', `Proposal is ${proposal.status}; only AWAITING_APPROVAL can be approved`);
      }
      if (proposal.expiresAt <= nowSeconds()) {
        await repos.proposals.transition(id, ['AWAITING_APPROVAL'], 'EXPIRED', { resolvedAt: nowSeconds(), resolutionReason: 'TTL elapsed' });
        throw new AppError(410, 'PROPOSAL_EXPIRED', 'Proposal approval window has elapsed');
      }
      // The signed deadline is also the execution deadline (enforced by the executor and, on v2, the
      // contract). Refuse an approval that leaves too little time to execute rather than extend it.
      if (proposal.expiresAt - nowSeconds() < config.approvalMinRemainingSeconds) {
        throw new AppError(410, 'APPROVAL_TOO_LATE', `Less than ${config.approvalMinRemainingSeconds}s remain before the signed execution deadline; create a new proposal`);
      }

      let approver;
      try {
        approver = recoverApprover(proposal, signature);
      } catch {
        throw unauthorized('Approval signature is malformed');
      }
      if (!sameAddress(approver, session.address)) {
        throw unauthorized('Approval signature was not produced by the signed-in owner for this exact proposal');
      }

      // Never trust the state captured at creation time: re-run policy and simulation now.
      const { policy, simulation } = await assess(proposal, { excludeId: id, auth: { kind: 'OWNER_SIGNATURE', signature } });
      if (!policy.passed) {
        await repos.proposals.transition(id, ['AWAITING_APPROVAL'], 'POLICY_REJECTED', {
          policyResult: policy, simulation, resolvedAt: nowSeconds(), resolutionReason: 'Policy failed at approval time',
        });
        await repos.audit.append({ actor: session.address, action: 'PROPOSAL_POLICY_FAILED_AT_APPROVAL', entityType: 'proposal', entityId: id, details: { violations: policy.violations } });
        throw unprocessable('POLICY_FAILED_AT_APPROVAL', 'Proposal no longer passes policy checks', { violations: policy.violations });
      }

      const approved = await repos.proposals.transition(
        id,
        ['AWAITING_APPROVAL'],
        'APPROVED',
        { approvedBy: session.address, approvalSignature: signature, approvedAt: nowSeconds(), policyResult: policy, simulation, approvalKind: 'OWNER_SIGNATURE', explanation: explainDecision({ policy, outcome: 'APPROVED_BY_OWNER' }) },
        { requireUnexpired: true },
      );
      if (!approved) throw conflict('INVALID_STATE', 'Proposal changed state or expired during approval');

      await repos.audit.append({
        actor: session.address,
        action: 'PROPOSAL_APPROVED',
        entityType: 'proposal',
        entityId: id,
        details: { intentId: approved.intentId, amountWei: approved.amountWei, recipient: approved.recipient, token: approved.token.symbol, signature },
      });
      if (executor) executor.enqueue(id);
      else logger.warn('Approved proposal but executor is not running', { proposalId: id });
      return decorate(approved);
    });
  }

  /**
   * Approval by a signed task grant (autonomous run). The scheduler has already routed the run to
   * AUTO_GRANT; this re-checks policy on fresh state and performs the atomic transition.
   */
  async function approveByGrant(id, { task, route }) {
    return approvalMutex.run(async () => {
      const proposal = await repos.proposals.findById(id);
      if (!proposal || proposal.status !== 'AWAITING_APPROVAL') throw conflict('INVALID_STATE', 'Proposal is not awaiting approval');
      const { policy, simulation } = await assess(proposal, { excludeId: id, auth: { kind: 'TASK_GRANT', task } });
      const explanation = explainDecision({ policy, route });
      if (!policy.passed) {
        await repos.proposals.transition(id, ['AWAITING_APPROVAL'], 'POLICY_REJECTED', { policyResult: policy, simulation, explanation, resolvedAt: nowSeconds(), resolutionReason: 'Policy failed at grant approval' });
        return { approved: false, policy, explanation };
      }
      const approved = await repos.proposals.transition(
        id,
        ['AWAITING_APPROVAL'],
        'APPROVED',
        { approvedBy: `task:${task.id}`, approvalSignature: task.grantSignature, approvedAt: nowSeconds(), policyResult: policy, simulation, approvalKind: 'TASK_GRANT', explanation },
        { requireUnexpired: true },
      );
      if (!approved) throw conflict('INVALID_STATE', 'Proposal changed state during grant approval');
      await repos.audit.append({
        actor: `task:${task.id}`,
        action: 'PROPOSAL_APPROVED_BY_GRANT',
        entityType: 'proposal',
        entityId: id,
        details: { taskId: task.id, authorizedBy: task.authorizedBy, intentId: approved.intentId, amountWei: approved.amountWei, recipient: approved.recipient },
      });
      if (executor) executor.enqueue(id);
      return { approved: true, proposal: approved, explanation };
    });
  }

  async function reject(id, reason, session) {
    await auth.assertOwner(session.address);
    const rejected = await repos.proposals.transition(id, ['AWAITING_APPROVAL'], 'REJECTED', {
      resolvedBy: session.address, resolutionReason: reason || 'Rejected by operator', resolvedAt: nowSeconds(),
    });
    if (!rejected) {
      const existing = await repos.proposals.findById(id);
      if (!existing) throw notFound('Proposal not found');
      throw conflict('INVALID_STATE', `Proposal is ${existing.status}; only AWAITING_APPROVAL can be rejected`);
    }
    await repos.audit.append({ actor: session.address, action: 'PROPOSAL_REJECTED', entityType: 'proposal', entityId: id, details: { reason: rejected.resolutionReason } });
    return decorate(rejected);
  }

  async function expireStale() {
    const expired = await repos.proposals.expireStale();
    for (const p of expired) {
      await repos.audit.append({ actor: 'system', action: 'PROPOSAL_EXPIRED', entityType: 'proposal', entityId: p.id, details: {} });
    }
    return expired.length;
  }

  return { create, get, list, approve, approveByGrant, reject, expireStale, assess, setExecutor, approvalTypedData };
}
