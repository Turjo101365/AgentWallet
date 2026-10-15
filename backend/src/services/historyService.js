import { ethers } from 'ethers';
import { badRequest, unprocessable } from '../lib/errors.js';
import { sameAddress } from '../lib/address.js';
import { agentWalletInterface } from './chainService.js';

/**
 * Transaction history from verified sources only: executor executions (receipt-verified) and
 * contract event logs indexed from the chain. A browser can ask the backend to look at a tx hash,
 * but every field comes from the chain, not from the request.
 */
export function createHistoryService({ config, repos, chain, indexer }) {
  async function list(limit = 100) {
    const [events, executions] = await Promise.all([repos.chainEvents.list({ limit }), repos.executions.listRecent(limit)]);
    const byTx = new Map();
    for (const ev of events) {
      const entry = byTx.get(ev.txHash) || { txHash: ev.txHash, blockNumber: ev.blockNumber, blockTimestamp: ev.blockTimestamp, status: 'CONFIRMED', events: [], explorerUrl: chain.txUrl(ev.txHash) };
      entry.events.push({ name: ev.eventName, args: ev.args, logIndex: ev.logIndex });
      byTx.set(ev.txHash, entry);
    }
    for (const ex of executions) {
      if (!ex.txHash) continue;
      const entry = byTx.get(ex.txHash) || { txHash: ex.txHash, blockNumber: ex.blockNumber, blockTimestamp: null, events: [], explorerUrl: chain.txUrl(ex.txHash) };
      entry.status = ex.status;
      entry.proposalId = ex.proposalId;
      entry.execution = { status: ex.status, errorCode: ex.errorCode, errorMessage: ex.errorMessage, gasUsed: ex.gasUsed, submittedAt: ex.submittedAt };
      byTx.set(ex.txHash, entry);
    }
    return [...byTx.values()].sort((a, b) => (b.blockNumber ?? Infinity) - (a.blockNumber ?? Infinity));
  }

  /** Verifies a tx hash on-chain (to == wallet contract, same chain) and indexes it. */
  async function track(txHash) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw badRequest('INVALID_TX_HASH', 'txHash must be a 32-byte hex string');
    const tx = await chain.provider.getTransaction(txHash);
    if (!tx) return { txHash, status: 'NOT_FOUND' };
    if (Number(tx.chainId) !== config.chainId) throw unprocessable('WRONG_CHAIN', 'Transaction is not on the configured chain');
    if (!sameAddress(tx.to, config.contractAddress)) throw unprocessable('NOT_WALLET_TX', 'Transaction is not addressed to the AgentWallet contract');
    let method = null;
    try {
      method = agentWalletInterface.parseTransaction({ data: tx.data, value: tx.value })?.name || null;
    } catch {
      method = tx.data === '0x' ? 'receive' : null;
    }
    const receipt = await chain.provider.getTransactionReceipt(txHash);
    if (!receipt) return { txHash, status: 'PENDING', method, from: tx.from };
    await indexer.syncOnce();
    return {
      txHash,
      status: receipt.status === 1 ? 'CONFIRMED' : 'REVERTED',
      method,
      from: tx.from,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      valueEth: ethers.formatEther(tx.value),
      explorerUrl: chain.txUrl(txHash),
    };
  }

  /** Current allowlist: addresses ever seen in RecipientUpdated, filtered by a live on-chain check. */
  async function recipients() {
    await indexer.syncOnce(); // make sure recent RecipientUpdated events are indexed
    const events = await repos.chainEvents.list({ limit: 5000, eventNames: ['RecipientUpdated'] });
    const labels = await repos.recipientLabels.allDetailed();
    const addresses = [...new Set(events.map((e) => e.args.recipient))];
    const demo = new Map((config.demoRecipients || []).map((r) => [r.address, r]));
    const rows = await Promise.all(
      addresses.map(async (address) => {
        const meta = labels.get(address) || demo.get(address) || {};
        return {
          address,
          allowed: await chain.isRecipientAllowed(address),
          label: meta.label || null,
          category: meta.category || null,
          explorerUrl: chain.addressUrl(address),
        };
      }),
    );
    return rows.filter((r) => r.allowed);
  }

  return { list, track, recipients };
}
