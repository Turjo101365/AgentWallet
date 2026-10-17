import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { ethers } from 'ethers';
import { startTestChain, deployFixture } from './helpers/chain.js';
import { buildTestApp, signIn, bearer, waitFor } from './helpers/app.js';

/**
 * Regression for the public v2 run's transaction 7 (Ethereum Sepolia, 0xb1a4fff1…, block 11930608).
 *  - The executor estimated executeGrantTransfer at 23:59:48 UTC (426,625 gas) and sent estimate × 1.2 = 511,950.
 *  - It was mined at 00:00:00 UTC. The new UTC day's spentPerDay slot was empty, so the transfer had to create it.
 *  - That needed 525,711 gas: out of gas.
 * The same mechanism is reproduced here on a local chain: a grant run is estimated just before 00:00 UTC (chain time)
 * and mined just after.
 *
 * The margin is lowered to 5% (test-only). On Sepolia the fresh-slot premium (99,086 gas) exceeded the 20% margin
 * (85,325); on Hardhat the premium is about 17,100 gas against a ~145,000 estimate, so 5% recreates
 * "premium > margin". Without the guard the run reverts out of gas exactly like tx 7; with the guard the executor
 * waits for the new UTC day, estimates there, and the transfer succeeds with the same small margin.
 */
const ETH = ethers.ZeroAddress;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);

async function scenario({ guardSeconds }) {
  const chain = await startTestChain();
  const fx = await deployFixture(chain.provider);
  const ctx = await buildTestApp({
    rpcUrl: chain.rpcUrl, deployment: fx.deployment,
    env: { EXECUTOR_GAS_MARGIN_PCT: '5', DAY_BOUNDARY_GUARD_SECONDS: String(guardSeconds), DAY_BOUNDARY_POLL_MS: '100', RECEIPT_TIMEOUT_MS: '60000', TASK_LEASE_SECONDS: '5' },
  });
  try {
    const token = await signIn(ctx.app, fx.owner);
    const api = (m, p) => request(ctx.app)[m](p).set(bearer(token));
    await api('put', '/api/policy').send({ autoApprovalMaxPerTx: { [ETH]: ethers.parseEther('0.005').toString() }, confirmLoosening: true }).expect(200);
    const grantTask = async (title) => {
      const t = (await api('post', '/api/tasks').send({ token: ETH, recipient: fx.payeeA.address, amount: '0.001', title, validUntil: now() + 3 * 86400, schedule: { type: 'once', at: now() + 1 } }).expect(201)).body.data;
      const { domain, types, message } = t.grantTypedData;
      await api('post', `/api/tasks/${t.id}/authorize`).send({ signature: await fx.owner.signTypedData(domain, types, message) }).expect(200);
      return t;
    };
    const runOf = async (taskId) => (await api('get', `/api/tasks/${taskId}`).expect(200)).body.data.runs[0];
    const latest = async () => chain.provider.getBlock('latest');
    const boundary = (Math.floor(Number((await latest()).timestamp) / 86400) + 1) * 86400; // next 00:00 UTC in chain time

    // 1. Chain time 150 s before 00:00 UTC (outside the guard): the first grant run writes today's spend slot.
    await chain.send('evm_setNextBlockTimestamp', [boundary - 150]);
    await chain.send('evm_mine', []);
    const a = await grantTask('first run of the day');
    await sleep(1100);
    await ctx.container.scheduler.tick();
    await ctx.container.executor.whenIdle();
    const runA = await waitFor(async () => {
      await ctx.container.scheduler.tick(); // a run moves to CONFIRMED on the tick after its receipt
      await ctx.container.executor.whenIdle();
      const r = await runOf(a.id);
      return r?.status === 'CONFIRMED' ? r : null;
    });
    const dayD = BigInt(Math.floor((boundary - 1) / 86400));
    assert.equal(await fx.wallet.spentPerDay(ETH, dayD), ethers.parseEther('0.001'), 'first run charged to day D');

    // 2. Chain time 60 s before 00:00 UTC; manual mining, so estimation and inclusion can straddle the boundary.
    await chain.send('evm_setNextBlockTimestamp', [boundary - 60]);
    await chain.send('evm_mine', []);
    await chain.send('evm_setAutomine', [false]);
    const b = await grantTask('second run, just before midnight');
    await sleep(1100);
    await ctx.container.scheduler.tick(); // creates and grant-approves the run; the executor starts in the background

    let crossed = false;
    const audits = async () => (await api('get', '/api/audit').expect(200)).body.data.map((x) => x.action);
    const cross = async () => {
      if (crossed) return;
      crossed = true;
      await chain.send('evm_setNextBlockTimestamp', [boundary + 5]);
      await chain.send('evm_mine', []);
    };
    const proposalB = await waitFor(async () => {
      const r = await runOf(b.id);
      const p = r?.proposalId ? (await api('get', `/api/proposals/${r.proposalId}`).expect(200)).body.data : null;
      if (p && ['CONFIRMED', 'FAILED'].includes(p.status)) return p;
      if (p?.execution?.txHash) {
        await cross(); // the signed tx is in the mempool: mine it, in the next UTC day if not there yet
        await chain.send('evm_mine', []);
      } else if ((await audits()).includes('EXECUTION_DAY_BOUNDARY_WAIT')) {
        await cross(); // the executor is waiting for the new day: let the chain reach it
      }
      return null;
    }, { timeoutMs: 60000, intervalMs: 200 });
    await chain.send('evm_setAutomine', [true]);

    const tx = await chain.provider.getTransaction(proposalB.execution.txHash);
    const rc = await chain.provider.getTransactionReceipt(proposalB.execution.txHash);
    const block = await chain.provider.getBlock(rc.blockNumber);
    return { ctx, chain, fx, runA, proposalB, tx, rc, block, boundary, auditActions: await audits() };
  } catch (err) {
    await ctx.container.close();
    await chain.stop();
    throw err;
  }
}

describe('executor gas limit across a UTC day boundary (public v2 run, tx 7)', () => {
  test('without the guard (the old behaviour): estimated before 00:00 UTC, mined after, out of gas, like tx 7', async () => {
    const s = await scenario({ guardSeconds: 0 });
    try {
      assert.ok(Number(s.block.timestamp) >= s.boundary, 'mined in the next UTC day');
      assert.equal(s.proposalB.status, 'FAILED');
      assert.equal(s.proposalB.execution.errorCode, 'TX_REVERTED');
      assert.equal(s.rc.status, 0);
      assert.equal(s.rc.gasUsed, s.tx.gasLimit, 'all gas consumed: out of gas, not a logic revert');
      const dayD1 = BigInt(Math.floor(s.boundary / 86400));
      assert.equal(await s.fx.wallet.spentPerDay(ETH, dayD1), 0n, 'the revert rolled everything back');
      // The same call with enough gas succeeds in the new day: the failure was the limit, not the authorization.
      await s.chain.provider.call({ to: s.tx.to, from: s.tx.from, data: s.tx.data, gasLimit: s.tx.gasLimit * 2n });
    } finally {
      await s.ctx.container.close();
      await s.chain.stop();
    }
  });

  test('with the guard: the executor waits for the new UTC day, estimates there, and the same 5% margin succeeds', async () => {
    const s = await scenario({ guardSeconds: 120 });
    try {
      assert.ok(s.auditActions.includes('EXECUTION_DAY_BOUNDARY_WAIT'), 'the wait is recorded in the audit log');
      assert.equal(s.proposalB.status, 'CONFIRMED', s.proposalB.resolutionReason);
      assert.equal(s.rc.status, 1);
      assert.ok(Number(s.block.timestamp) >= s.boundary, 'mined in the new UTC day it was estimated in');
      assert.ok(s.rc.gasUsed < s.tx.gasLimit);
      assert.equal(await s.fx.wallet.spentPerDay(ETH, BigInt(Math.floor(s.boundary / 86400))), ethers.parseEther('0.001'));
    } finally {
      await s.ctx.container.close();
      await s.chain.stop();
    }
  });

  test('a gas limit above the configured cap is refused and nothing is sent', async () => {
    const chain = await startTestChain();
    const fx = await deployFixture(chain.provider);
    const ctx = await buildTestApp({ rpcUrl: chain.rpcUrl, deployment: fx.deployment, env: { EXECUTOR_GAS_LIMIT_CAP: '100000' } });
    try {
      const token = await signIn(ctx.app, fx.owner);
      const p = (await request(ctx.app).post('/api/proposals').set(bearer(token)).send({ token: ETH, recipient: fx.payeeA.address, amount: '0.001' }).expect(201)).body.data;
      const nonce = await chain.provider.getTransactionCount(fx.agent.address);
      const { domain, types, message } = p.approvalTypedData;
      await request(ctx.app).post(`/api/proposals/${p.id}/approve`).set(bearer(token)).set('Idempotency-Key', `cap-${Date.now()}-abcdef`).send({ signature: await fx.owner.signTypedData(domain, types, message) }).expect(200);
      const done = await waitFor(async () => { const x = (await request(ctx.app).get(`/api/proposals/${p.id}`).set(bearer(token))).body.data; return ['CONFIRMED', 'FAILED'].includes(x.status) ? x : null; });
      assert.equal(done.status, 'FAILED');
      assert.equal(done.execution.errorCode, 'GAS_LIMIT_ABOVE_CAP');
      assert.equal(done.execution.txHash, null);
      assert.equal(await chain.provider.getTransactionCount(fx.agent.address), nonce, 'no transaction sent');
    } finally {
      await ctx.container.close();
      await chain.stop();
    }
  });
});
