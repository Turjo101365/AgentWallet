import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestChain, deployFixture } from './helpers/chain.js';
import { buildTestApp } from './helpers/app.js';
import { loadConfig } from '../src/config/env.js';

// Regression (Base Sepolia readiness B1): https://sepolia.base.org rejects eth_getLogs over more than
// 200 blocks with -32614 "eth_getLogs is limited to a 200 range". The indexer used fixed 2,000-block
// chunks, so every sync would have failed there and transaction history would stay empty.

const LIMIT = 200;

/** Makes the provider behave like the Base Sepolia public RPC for eth_getLogs, and records ranges. */
function limitGetLogs(provider) {
  const ranges = [];
  const original = provider.getLogs.bind(provider);
  provider.getLogs = async (filter) => {
    const size = Number(filter.toBlock) - Number(filter.fromBlock) + 1;
    ranges.push(size);
    if (size > LIMIT) throw Object.assign(new Error(`eth_getLogs is limited to a ${LIMIT} range`), { code: -32614 });
    return original(filter);
  };
  return ranges;
}

describe('indexer block range', () => {
  const base = { CHAIN_ID: '31337', DEPLOYMENT_FILE: 'nonexistent.json', LOG_LEVEL: 'silent' };

  test('defaults per network: 2000 on the local chain, 200 on Base Sepolia; INDEXER_BLOCK_RANGE overrides', () => {
    assert.equal(loadConfig(base).indexerBlockRange, 2000);
    assert.equal(loadConfig({ ...base, CHAIN_ID: '84532' }).indexerBlockRange, 200);
    assert.equal(loadConfig({ ...base, CHAIN_ID: '84532', INDEXER_BLOCK_RANGE: '50' }).indexerBlockRange, 50);
    assert.equal(loadConfig({ ...base, CHAIN_ID: '11155111' }).indexerBlockRange, 2000);
    assert.throws(() => loadConfig({ ...base, INDEXER_BLOCK_RANGE: '0' }));
  });

  describe('against a local chain with the Base Sepolia getLogs limit', () => {
    let chain, fx;
    before(async () => {
      chain = await startTestChain();
      fx = await deployFixture(chain.provider);
      // Spread events across more than two 200-block windows: one recipient change, 450 empty blocks, another.
      await (await fx.wallet.connect(fx.ownerSigner).setRecipient(fx.payeeB.address, true)).wait();
      await chain.send('hardhat_mine', ['0x1c2']);
      await (await fx.wallet.connect(fx.ownerSigner).setRecipient(fx.payeeB.address, false)).wait();
    });
    after(async () => chain?.stop());

    test('a 200-block range indexes every event and never exceeds the limit', async () => {
      const ctx = await buildTestApp({ rpcUrl: chain.rpcUrl, deployment: fx.deployment, env: { INDEXER_BLOCK_RANGE: String(LIMIT) } });
      const ranges = limitGetLogs(ctx.container.chain.provider);
      const status = await ctx.container.indexer.syncOnce();
      assert.equal(status.lastError, null);
      assert.ok(ranges.length >= 3, `expected several chunks, got ${ranges.length}`);
      assert.ok(ranges.every((r) => r <= LIMIT), `ranges: ${ranges.join(',')}`);
      const latest = await chain.provider.getBlockNumber();
      assert.equal(status.lastSyncedBlock, latest);
      const rows = (await ctx.container.db.query("SELECT args, block_number FROM chain_events WHERE event_name = 'RecipientUpdated' ORDER BY block_number")).rows;
      const b = rows.filter((r) => r.args.recipient === fx.payeeB.address);
      assert.deepEqual(b.map((r) => r.args.allowed), [true, false], 'both payee B updates, 450+ blocks apart, are indexed');
      assert.ok(Number(b[1].block_number) - Number(b[0].block_number) > LIMIT);
      await ctx.container.close();
    });

    test('the previous fixed 2,000-block chunk fails under the same limit', async () => {
      const ctx = await buildTestApp({ rpcUrl: chain.rpcUrl, deployment: fx.deployment, env: { INDEXER_BLOCK_RANGE: '2000' } });
      limitGetLogs(ctx.container.chain.provider);
      const status = await ctx.container.indexer.syncOnce();
      assert.match(status.lastError, /limited to a 200 range/);
      await ctx.container.close();
    });
  });
});
