import { ethers } from 'ethers';
import { agentWalletInterface } from './chainService.js';

const REORG_DEPTH = 12;

/**
 * Indexes AgentWallet events from chain logs into chain_events. Transaction history is built from
 * these verified logs, never from what a browser reports. Only blocks at the configured
 * confirmation depth are indexed; if the last indexed block's hash changes (reorg), the indexer
 * rewinds REORG_DEPTH blocks and re-indexes. Logs are read in ranges of at most
 * config.indexerBlockRange blocks, because public RPCs cap eth_getLogs ranges (Base Sepolia: 200).
 */
export function createIndexerService({ config, repos, chain, executor, logger }) {
  const chunk = config.indexerBlockRange;
  const stateId = `agentwallet:${config.chainId}:${(config.contractAddress || 'none').toLowerCase()}`;
  let running = false;
  let timer = null;
  const status = { lastSyncedBlock: null, lastError: null, lastRunAt: null };

  function serializeArgs(parsed) {
    const out = {};
    parsed.fragment.inputs.forEach((input, i) => {
      const v = parsed.args[i];
      out[input.name] = typeof v === 'bigint' ? v.toString() : typeof v === 'string' && ethers.isAddress(v) ? ethers.getAddress(v) : v;
    });
    return out;
  }

  async function syncOnce() {
    if (!config.contractAddress || running) return status;
    running = true;
    status.lastRunAt = Date.now();
    try {
      const provider = chain.provider;
      let state = (await repos.chainEvents.getState(stateId)) || { lastBlock: Math.max(0, config.deployBlock - 1), lastBlockHash: null };

      if (state.lastBlockHash && state.lastBlock > 0) {
        const block = await provider.getBlock(state.lastBlock);
        if (!block || block.hash !== state.lastBlockHash) {
          const from = Math.max(config.deployBlock, state.lastBlock - REORG_DEPTH);
          logger.warn('Reorg detected; rewinding indexer', { from, lastBlock: state.lastBlock });
          await repos.chainEvents.deleteFromBlock(config.chainId, from);
          state = { lastBlock: from - 1, lastBlockHash: null };
        }
      }

      const latest = await provider.getBlockNumber();
      const target = latest - (config.confirmations - 1);
      const blockTimes = new Map();
      for (let from = state.lastBlock + 1; from <= target; from += chunk) {
        const to = Math.min(target, from + chunk - 1);
        const logs = await provider.getLogs({ address: config.contractAddress, fromBlock: from, toBlock: to });
        const events = [];
        for (const log of logs) {
          let parsed;
          try {
            parsed = agentWalletInterface.parseLog(log);
          } catch {
            continue;
          }
          if (!parsed) continue;
          if (!blockTimes.has(log.blockNumber)) blockTimes.set(log.blockNumber, Number((await provider.getBlock(log.blockNumber)).timestamp));
          events.push({
            chainId: config.chainId,
            contractAddress: config.contractAddress,
            blockNumber: log.blockNumber,
            blockHash: log.blockHash,
            blockTimestamp: blockTimes.get(log.blockNumber),
            txHash: log.transactionHash,
            logIndex: log.index,
            eventName: parsed.name,
            args: serializeArgs(parsed),
          });
        }
        await repos.chainEvents.insertMany(events);
        const toBlock = await provider.getBlock(to);
        await repos.chainEvents.setState(stateId, { chainId: config.chainId, contractAddress: config.contractAddress, lastBlock: to, lastBlockHash: toBlock.hash });
        for (const ev of events) {
          if (ev.eventName === 'TransferExecuted') await executor.reconcileIntent(ev.args.intentId);
        }
        state = { lastBlock: to, lastBlockHash: toBlock.hash };
      }
      status.lastSyncedBlock = state.lastBlock;
      status.lastError = null;
    } catch (err) {
      status.lastError = err.shortMessage || err.message;
      logger.warn('Indexer sync failed', { error: status.lastError });
    } finally {
      running = false;
    }
    return status;
  }

  return {
    syncOnce,
    status,
    start() {
      if (timer) return;
      timer = setInterval(() => syncOnce(), config.indexerPollMs);
      timer.unref?.();
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}
