import crypto from 'node:crypto';
import { ethers } from 'ethers';
import { explainDecision } from './policyService.js';
import { decodeContractError, serializeSnapshot } from './chainService.js';
import { approvalTypedData, recoverApprover, intentIdFor } from '../lib/approval.js';
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

  async function simulate(p) {
    if (!config.executor.enabled) return { success: false, error: { name: 'ExecutorDisabled', args: [] } };
    const args = [p.intentId, p.token.address, p.recipient, BigInt(p.amountWei)];
    const from = config.executor.address;
    try {
      await chain.contract.executeTransfer.staticCall(...args, { from });
      const gasEstimate = await chain.contract.executeTransfer.estimateGas(...args, { from });
      const feeData = await chain.provider.getFeeData();
      const feePerGas = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
      return {
        success: true,
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

  /** Centralized risk assessment + static simulation against fresh chain state. */
  async function assess(p, { excludeId = null } = {}) {
    const { policy } = await risk.assessTransfer({
      tokenAddress: p.token.address,
      recipient: p.recipient,
      amountWei: p.amountWei,
      excludeId,
      source: p.source,
    });
    let simulation = null;
    if (policy.passed) {
      simulation = await simulate(p);
      const label = simulation.success ? `Static call succeeded; gas estimate ${simulation.gasEstimate}` : `Static call reverted: ${simulation.error?.name || 'unknown'}`;
      policy.checks.push({ id: 'SIMULATION', passed: simulation.success, message: label });
      if (!simulation.success) {
        policy.passed = false;
        policy.violations.push({ id: 'SIMULATION', message: label });
      }
    }
    return { policy, simulation };
  }

  async function create({ tokenAddress, recipient, amount, memo, source = 'MANUAL', decisionId = null, taskRunId = null, amountWeiOverride = null }, actor) {
    const token = resolveToken(tokenAddress);
    const to = normalizeAddress(recipient, 'recipient');
    const amountWei = amountWeiOverride !== null ? BigInt(amountWeiOverride) : parseAmount(amount, token.decimals);
    if (amountWei <= 0n) throw badRequest('INVALID_AMOUNT', 'Amount must be greater than zero');

    const id = crypto.randomUUID();
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
      const { policy, simulation } = await assess(proposal, { excludeId: id });
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
      const { policy, simulation } = await assess(proposal, { excludeId: id });
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
