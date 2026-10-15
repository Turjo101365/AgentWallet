import { ethers } from 'ethers';
import { decodeContractError, agentWalletInterface } from './chainService.js';
import { Mutex } from '../lib/mutex.js';
import { nowSeconds } from '../lib/time.js';
import { sameAddress } from '../lib/address.js';

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

      // 2. Static simulation and gas estimate from the executor address.
      const wallet = chain.contract.connect(signer);
      const args = [proposal.intentId, proposal.token.address, proposal.recipient, BigInt(proposal.amountWei)];
      let gasEstimate;
      try {
        await wallet.executeTransfer.staticCall(...args);
        gasEstimate = await wallet.executeTransfer.estimateGas(...args);
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
      const gasLimit = (gasEstimate * 120n) / 100n;
      const maxCost = gasLimit * maxFeePerGas;
      const executorBalance = await chain.provider.getBalance(config.executor.address);
      if (executorBalance < maxCost) {
        return fail(execution, proposal, 'EXECUTOR_GAS_INSUFFICIENT', `Executor needs ${ethers.formatEther(maxCost)} ETH for gas, has ${ethers.formatEther(executorBalance)}`);
      }

      // 4. Sign locally, persist the hash, then broadcast.
      const nonce = await chain.provider.getTransactionCount(config.executor.address, 'pending');
      const populated = await wallet.executeTransfer.populateTransaction(...args);
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
      await audit('EXECUTION_SUBMITTED', proposal.id, { txHash, nonce, gasLimit: gasLimit.toString(), intentId: proposal.intentId });

      try {
        await chain.provider.broadcastTransaction(signed);
      } catch (err) {
        // The node may have accepted it anyway (timeouts); the watcher decides from chain state.
        logger.warn('Broadcast reported an error; will reconcile from chain', { proposalId, txHash, error: err.shortMessage || err.message });
      }
      watchArgs = [submitted, proposal];
    });
    if (watchArgs) await watch(...watchArgs);
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
        watch(execution, proposal).catch((err) => logger.error('Recovery watch failed', { error: err.message }));
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

  return { enqueue, recover, reconcileIntent, enabled: Boolean(signer), address: config.executor.address, whenIdle: () => Promise.all([...inflight.values()]) };
}
