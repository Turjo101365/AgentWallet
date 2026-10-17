import { ethers } from 'ethers';
import { decodeContractError, agentWalletInterface } from './chainService.js';
import { Mutex } from '../lib/mutex.js';
import { nowSeconds } from '../lib/time.js';
import { sameAddress } from '../lib/address.js';
import { recoverApprover, intentIdFor, approvalTypedData } from '../lib/approval.js';
import { verifyGrant, grantTypedData } from '../lib/schedule.js';

/**
 * Limited-authority executor. Holds the agent key, which the contract only lets call
 * executeTransfer within owner-set limits to owner-allowlisted recipients.
 *
 * Safety properties:
 *  - Only APPROVED proposals are executed, each at most once (unique execution row per proposal,
 *    plus the contract's executedIntents mapping as the final guard).
 *  - Policy is re-checked, the call is simulated and gas is estimated immediately before signing.
 *  - The transaction is signed locally and its hash is persisted BEFORE broadcast, so a crash or
 *    RPC timeout can always be reconciled against the chain afterwards.
 *  - Nonces are allocated inside a mutex from the 'pending' count, so sends never race.
 *  - Success is only recorded after the receipt is mined, has status 1, targets the wallet and
 *    contains the matching TransferExecuted event.
 */
export function createExecutorService({ config, repos, chain, risk, signerProvider, logger }) {
  let sandboxGuard = null;
  const sendMutex = new Mutex();
  const watching = new Set();
  const signer = signerProvider?.connect(chain.provider) || null;
  const inflight = new Map();

  async function audit(action, proposalId, details) {
    await repos.audit.append({ actor: config.executor.address || 'executor', action, entityType: 'proposal', entityId: proposalId, details });
  }

  async function fail(execution, proposal, code, message, details = {}) {
    await repos.executions.update(execution.id, { status: 'FAILED', errorCode: code, errorMessage: message.slice(0, 500) });
    await repos.proposals.transition(proposal.id, ['APPROVED', 'SUBMITTED'], 'FAILED', { resolvedAt: nowSeconds(), resolutionReason: `${code}: ${message}`.slice(0, 500) });
    await audit('EXECUTION_FAILED', proposal.id, { code, message, ...details });
    logger.warn('Execution failed', { proposalId: proposal.id, code, message });
  }

  /**
   * Re-derives the authority for this exact proposal row immediately before signing, independent of
   * the checks made when it was approved: the database row could have been edited since, the owner
   * could have changed, or the signed deadline could have passed while the executor was down.
   * Returns { denied: { code, message } } or { denied: null, kind, task }.
   */
  async function checkAuthorization(proposal) {
    const deny = (code, message) => ({ denied: { code, message } });
    const now = nowSeconds();
    if (proposal.chainId !== config.chainId || !sameAddress(proposal.contractAddress, config.contractAddress)) {
      return deny('AUTHORIZATION_SCOPE_MISMATCH', 'Proposal is not for this chain and contract');
    }
    if (proposal.intentId !== intentIdFor({ chainId: config.chainId, contractAddress: config.contractAddress, proposalId: proposal.id })) {
      return deny('AUTHORIZATION_SCOPE_MISMATCH', 'Proposal intent id does not derive from its id, chain and contract');
    }
    const owner = await chain.getOwner();
    const kind = proposal.approvalKind || (proposal.approvedBy && !String(proposal.approvedBy).startsWith('task:') ? 'OWNER_SIGNATURE' : null);

    if (kind === 'OWNER_SIGNATURE') {
      // The signed `deadline` is the execution deadline; it is never extended.
      if (now > proposal.expiresAt) {
        return deny('APPROVAL_EXPIRED', `The owner's signed deadline ${new Date(proposal.expiresAt * 1000).toISOString()} has passed`);
      }
      let signer;
      try {
        signer = recoverApprover(proposal, proposal.approvalSignature);
      } catch {
        return deny('APPROVAL_SIGNATURE_INVALID', 'Stored approval signature is malformed');
      }
      if (!sameAddress(signer, proposal.approvedBy)) {
        return deny('APPROVAL_SIGNATURE_INVALID', 'Approval signature does not cover this proposal as stored');
      }
      if (!sameAddress(signer, owner)) {
        return deny('APPROVER_NOT_OWNER', `Approval was signed by ${signer}, which is no longer the contract owner`);
      }
      return { denied: null, kind, task: null };
    }

    if (kind === 'TASK_GRANT') {
      const run = proposal.taskRunId ? await repos.runs.findById(proposal.taskRunId) : null;
      const task = run ? await repos.tasks.findById(run.taskId) : null;
      if (!task) return deny('GRANT_SIGNATURE_INVALID', 'Proposal is not linked to an authorized task');
      if (['CANCELLED', 'EXPIRED'].includes(task.status)) {
        return deny('GRANT_REVOKED', `Task is ${task.status}`);
      }
      if (now > task.validUntil) {
        return deny('GRANT_EXPIRED', `The signed grant expired at ${new Date(task.validUntil * 1000).toISOString()}`);
      }
      const grant = verifyGrant(task);
      if (!grant.valid) return deny('GRANT_SIGNATURE_INVALID', `Task grant does not verify: ${grant.reason}`);
      if (!sameAddress(grant.signer, owner)) {
        return deny('APPROVER_NOT_OWNER', `Grant was signed by ${grant.signer}, which is no longer the contract owner`);
      }
      if (
        proposal.approvalSignature !== task.grantSignature ||
        !sameAddress(proposal.token.address, task.token.address) ||
        !sameAddress(proposal.recipient, task.recipient) ||
        proposal.amountWei !== task.amountWei
      ) {
        return deny('GRANT_SIGNATURE_INVALID', 'Proposal token, recipient or amount differs from the signed grant');
      }
      return { denied: null, kind, task };
    }

    return deny('AUTHORIZATION_UNKNOWN', 'Proposal has no recognised approval');
  }

  /**
   * v1: executeTransfer(intent, token, recipient, amount); the contract trusts the agent key.
   * v2: the owner's signature travels with the call and the contract verifies it against owner():
   *     executeApprovedTransfer(ApproveTransfer, sig) or executeGrantTransfer(AuthorizeTask, sig, intent).
   */
  function executionCall(proposal, authz) {
    if (chain.contractVersion() === 1) {
      return { method: 'executeTransfer', args: [proposal.intentId, proposal.token.address, proposal.recipient, BigInt(proposal.amountWei)] };
    }
    if (authz.kind === 'TASK_GRANT') {
      return { method: 'executeGrantTransfer', args: [grantTypedData(authz.task).message, authz.task.grantSignature, proposal.intentId] };
    }
    return { method: 'executeApprovedTransfer', args: [approvalTypedData(proposal).message, proposal.approvalSignature] };
  }

  /**
   * The contract charges each transfer to spentPerDay[token][block.timestamp / 1 day]. A transfer estimated in one UTC
   * day and mined in the next writes a FRESH slot for the new day, which costs more gas than the estimate (made against
   * the old day's already-written slot) covered. Public v2 run, tx 7: estimated 426,625 at 23:59:48 UTC (limit 511,950),
   * mined at 00:00:00 UTC where it needed 525,711, so it ran out of gas. Within the guard window before a boundary,
   * wait (bounded) until the chain is in the new UTC day, so the estimate and the inclusion see the same day slot.
   * Chain time is max(latest block timestamp, wall clock): public chains track the wall clock; a local chain may be ahead.
   */
  async function waitOutDayBoundary(proposal) {
    const guard = config.dayBoundaryGuardSeconds;
    if (!guard) return { waited: false };
    const chainTime = async () => Math.max(Number((await chain.provider.getBlock('latest')).timestamp), nowSeconds());
    const start = await chainTime();
    const toBoundary = 86400 - (start % 86400);
    if (toBoundary > guard) return { waited: false };
    const day = Math.floor(start / 86400);
    await audit('EXECUTION_DAY_BOUNDARY_WAIT', proposal.id, { chainTime: start, secondsToBoundary: toBoundary, guardSeconds: guard });
    logger.info('Waiting for the UTC day boundary before estimating gas', { proposalId: proposal.id, secondsToBoundary: toBoundary });
    const giveUp = Date.now() + (toBoundary + 120) * 1000;
    while (Math.floor((await chainTime()) / 86400) === day) {
      if (Date.now() > giveUp) return { waited: true, failed: true, message: `Chain did not reach the next UTC day within ${toBoundary + 120}s` };
      await new Promise((r) => setTimeout(r, config.dayBoundaryPollMs));
    }
    return { waited: true };
  }

  function enqueue(proposalId) {
    if (!inflight.has(proposalId)) {
      const job = execute(proposalId)
        .catch((err) => logger.error('Executor crashed on proposal', { proposalId, error: err.message }))
        .finally(() => inflight.delete(proposalId));
      inflight.set(proposalId, job);
    }
    return inflight.get(proposalId);
  }

  async function execute(proposalId) {
    try {
    let watchArgs = null;
    await sendMutex.run(async () => {
      const proposal = await repos.proposals.findById(proposalId);
      if (!proposal || proposal.status !== 'APPROVED') return;

      const execution = (await repos.executions.create({ proposalId, intentId: proposal.intentId, executorAddress: config.executor.address || 'none' }))
        || (await repos.executions.findByProposal(proposalId));
      if (execution.status !== 'PREPARING' || execution.txHash) return;

      if (!signer) return fail(execution, proposal, 'EXECUTOR_DISABLED', 'No executor key configured');

      if (await chain.isIntentExecuted(proposal.intentId)) {
        await reconcileIntent(proposal.intentId);
        return;
      }

      // 0. Authority for this exact row: signature, signer is the current owner, deadline not passed.
      let authz = await checkAuthorization(proposal);
      if (authz.denied) return fail(execution, proposal, authz.denied.code, authz.denied.message);

      // 0b. Never estimate gas just before 00:00 UTC (see waitOutDayBoundary); re-check authority after any wait.
      const boundary = await waitOutDayBoundary(proposal);
      if (boundary.failed) return fail(execution, proposal, 'DAY_BOUNDARY_WAIT_TIMEOUT', boundary.message);
      if (boundary.waited) {
        authz = await checkAuthorization(proposal);
        if (authz.denied) return fail(execution, proposal, authz.denied.code, authz.denied.message);
      }

      // 1. Fresh risk assessment (same engine as creation and approval), excluding this proposal from reservations.
      const { policy } = await risk.assessTransfer({
        tokenAddress: proposal.token.address,
        recipient: proposal.recipient,
        amountWei: proposal.amountWei,
        excludeId: proposal.id,
        source: proposal.source,
      });
      if (!policy.passed) {
        return fail(execution, proposal, 'PREFLIGHT_POLICY_FAILED', policy.violations.map((v) => v.message).join('; '), { violations: policy.violations });
      }

      // 2. Static simulation and gas estimate from the executor address, through the exact call to be signed.
      const wallet = chain.executionContract().connect(signer);
      const { method, args } = executionCall(proposal, authz);
      let gasEstimate;
      try {
        await wallet[method].staticCall(...args);
        gasEstimate = await wallet[method].estimateGas(...args);
      } catch (err) {
        const decoded = decodeContractError(err);
        return fail(execution, proposal, 'SIMULATION_REVERTED', decoded ? `${decoded.name}(${decoded.args.join(', ')})` : err.shortMessage || err.message, { decoded });
      }

      // 3. Fees and gas reserve.
      const feeData = await chain.provider.getFeeData();
      const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 0n;
      if (maxFeePerGas === null || maxFeePerGas === undefined) return fail(execution, proposal, 'FEE_DATA_UNAVAILABLE', 'Network fee data unavailable');
      if (maxFeePerGas > config.maxFeePerGasWei) {
        return fail(execution, proposal, 'GAS_PRICE_TOO_HIGH', `maxFeePerGas ${ethers.formatUnits(maxFeePerGas, 'gwei')} gwei exceeds cap`);
      }
      const gasLimit = (gasEstimate * BigInt(100 + config.executorGasMarginPct)) / 100n;
      if (gasLimit > config.executorGasLimitCap) {
        return fail(execution, proposal, 'GAS_LIMIT_ABOVE_CAP', `Gas limit ${gasLimit} (estimate ${gasEstimate} + ${config.executorGasMarginPct}%) exceeds the cap ${config.executorGasLimitCap}`);
      }
      const maxCost = gasLimit * maxFeePerGas;
      const executorBalance = await chain.provider.getBalance(config.executor.address);
      if (executorBalance < maxCost) {
        return fail(execution, proposal, 'EXECUTOR_GAS_INSUFFICIENT', `Executor needs ${ethers.formatEther(maxCost)} ETH for gas, has ${ethers.formatEther(executorBalance)}`);
      }

      // 4. Sign locally, persist the hash, then broadcast.
      if (sandboxGuard) {
        try { await sandboxGuard.reserve(proposal, { maxCost }); }
        catch (e) { return fail(execution, proposal, e.code || 'SANDBOX_DENIED', e.message); }
      }
      const nonce = await chain.provider.getTransactionCount(config.executor.address, 'pending');
      const populated = await wallet[method].populateTransaction(...args);
      const signed = await signer.signTransaction({
        ...populated,
        chainId: config.chainId,
        nonce,
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas > maxFeePerGas ? maxFeePerGas : maxPriorityFeePerGas,
        type: 2,
      });
      const txHash = ethers.keccak256(signed);

      const submitted = await repos.executions.update(execution.id, {
        status: 'SUBMITTED',
        txHash,
        nonce,
        gasLimit: gasLimit.toString(),
        maxFeePerGas: maxFeePerGas.toString(),
        submittedAt: nowSeconds(),
      });
      await repos.proposals.transition(proposal.id, ['APPROVED'], 'SUBMITTED');
      await audit('EXECUTION_SUBMITTED', proposal.id, { txHash, nonce, gasLimit: gasLimit.toString(), intentId: proposal.intentId, method, contractVersion: chain.contractVersion() });
      await sandboxGuard?.submitted(proposal.id, txHash);

      try {
        await chain.provider.broadcastTransaction(signed);
      } catch (err) {
        // The node may have accepted it anyway (timeouts); the watcher decides from chain state.
        logger.warn('Broadcast reported an error; will reconcile from chain', { proposalId, txHash, error: err.shortMessage || err.message });
      }
      watchArgs = [submitted, proposal];
    });
    if (watchArgs) await watch(...watchArgs);
    } finally { await sandboxGuard?.complete(proposalId).catch(() => {}); }
  }

  function matchTransferEvent(receipt, proposal) {
    for (const log of receipt.logs) {
      if (!sameAddress(log.address, config.contractAddress)) continue;
      let parsed;
      try {
        parsed = agentWalletInterface.parseLog(log);
      } catch {
        continue;
      }
      if (
        parsed?.name === 'TransferExecuted' &&
        parsed.args.intentId === proposal.intentId &&
        sameAddress(parsed.args.token, proposal.token.address) &&
        sameAddress(parsed.args.recipient, proposal.recipient) &&
        parsed.args.amount === BigInt(proposal.amountWei)
      ) {
        return parsed;
      }
    }
    return null;
  }

  async function watch(execution, proposal) {
    if (watching.has(execution.id)) return;
    watching.add(execution.id);
    try {
      const receipt = await chain.provider.waitForTransaction(execution.txHash, config.confirmations, config.receiptTimeoutMs).catch((err) => {
        logger.warn('Receipt wait failed', { txHash: execution.txHash, error: err.message });
        return null;
      });
      if (!receipt) {
        const tx = await chain.provider.getTransaction(execution.txHash).catch(() => null);
        if (!tx && !(await chain.isIntentExecuted(proposal.intentId))) {
          return fail(execution, proposal, 'TX_NOT_FOUND', `Transaction ${execution.txHash} was not found on-chain after ${config.receiptTimeoutMs}ms`);
        }
        logger.info('Transaction still pending; recovery will retry', { txHash: execution.txHash });
        return;
      }
      await finalize(execution, proposal, receipt);
    } finally {
      watching.delete(execution.id);
    }
  }

  async function finalize(execution, proposal, receipt) {
    const common = {
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: (receipt.gasPrice ?? 0n).toString(),
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
    };
    if (receipt.status !== 1) {
      await repos.executions.update(execution.id, common);
      return fail(execution, proposal, 'TX_REVERTED', `Transaction ${receipt.hash} reverted in block ${receipt.blockNumber}`);
    }
    if (!sameAddress(receipt.to, config.contractAddress) || !matchTransferEvent(receipt, proposal)) {
      await repos.executions.update(execution.id, common);
      return fail(execution, proposal, 'RECEIPT_MISMATCH', 'Receipt does not contain the expected TransferExecuted event');
    }
    await repos.executions.update(execution.id, { ...common, status: 'CONFIRMED', confirmedAt: nowSeconds(), errorCode: null, errorMessage: null });
    await repos.proposals.transition(proposal.id, ['SUBMITTED', 'FAILED'], 'CONFIRMED', { resolvedAt: nowSeconds(), resolutionReason: null });
    await audit('EXECUTION_CONFIRMED', proposal.id, { txHash: receipt.hash, blockNumber: receipt.blockNumber, gasUsed: common.gasUsed });
    logger.info('Transfer confirmed', { proposalId: proposal.id, txHash: receipt.hash, block: receipt.blockNumber });
  }

  /** Called by the indexer and recovery when the chain shows an intent as executed. */
  async function reconcileIntent(intentId) {
    const proposal = await repos.proposals.findByIntentId(intentId);
    if (!proposal || proposal.status === 'CONFIRMED') return;
    const execution = await repos.executions.findByProposal(proposal.id);
    if (!execution?.txHash) {
      logger.error('Intent executed on-chain without a recorded transaction', { intentId, proposalId: proposal.id });
      await audit('RECONCILIATION_ANOMALY', proposal.id, { intentId, note: 'executed on-chain without a recorded tx hash' });
      return;
    }
    const receipt = await chain.provider.getTransactionReceipt(execution.txHash);
    if (receipt) await finalize(execution, proposal, receipt);
  }

  /** Restart recovery: resume anything approved or in flight. */
  async function recover() {
    if (!signer) return { resumed: 0 };
    let resumed = 0;
    for (const execution of await repos.executions.listByStatus(['PREPARING', 'SUBMITTED'])) {
      const proposal = await repos.proposals.findById(execution.proposalId);
      if (!proposal) continue;
      if (execution.status === 'SUBMITTED') {
        resumed++;
        const job=watch(execution, proposal).catch((err) => logger.error('Recovery watch failed', { error: err.message }))
          .finally(async()=>{await sandboxGuard?.complete(proposal.id).catch(()=>{});inflight.delete(proposal.id);});
        inflight.set(proposal.id,job);
      } else if (proposal.status === 'APPROVED') {
        resumed++;
        enqueue(proposal.id);
      }
    }
    for (const proposal of await repos.proposals.list({ status: ['APPROVED'], limit: 100 })) {
      if (!(await repos.executions.findByProposal(proposal.id))) {
        resumed++;
        enqueue(proposal.id);
      }
    }
    return { resumed };
  }

  return { enqueue, recover, reconcileIntent, setSandboxGuard: (guard) => { sandboxGuard = guard; }, enabled: Boolean(signer), address: config.executor.address, whenIdle: () => Promise.all([...inflight.values()]) };
}
