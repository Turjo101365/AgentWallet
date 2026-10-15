import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import { ethers } from 'ethers';
import { startTestChain, deployFixture, artifact } from './helpers/chain.js';
import { buildTestApp, signIn, signApproval, bearer, idemKey, waitFor, tempDir } from './helpers/app.js';
import { createSchedulerService } from '../src/services/schedulerService.js';
import { createLogger } from '../src/lib/logger.js';

const ETH = ethers.ZeroAddress;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);

function stubRl(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const out = handler(req, body ? JSON.parse(body) : null);
        res.writeHead(out.status || 200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(out.body));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }));
  });
}

describe('autonomous scheduler on a real local chain', () => {
  let chain, fx;
  before(async () => {
    chain = await startTestChain();
    fx = await deployFixture(chain.provider);
  });
  after(async () => chain?.stop());

  async function setup(env = {}, extra = {}) {
    const ctx = await buildTestApp({ rpcUrl: chain.rpcUrl, deployment: fx.deployment, env: { TASK_LEASE_SECONDS: '5', ...env }, ...extra });
    const token = await signIn(ctx.app, fx.owner);
    return { ...ctx, token };
  }

  async function allowAuto(ctx, wei, symbolAddr = ETH) {
    await request(ctx.app).put('/api/policy').set(bearer(ctx.token)).send({ autoApprovalMaxPerTx: { [symbolAddr]: wei.toString() }, confirmLoosening: true }).expect(200);
  }

  function createTask(ctx, body) {
    return request(ctx.app).post('/api/tasks').set(bearer(ctx.token)).send({ token: ETH, recipient: fx.payeeA.address, amount: '0.001', validUntil: now() + 3600, schedule: { type: 'once', at: now() + 1 }, ...body });
  }

  async function authorize(ctx, task, signer = fx.owner) {
    const { domain, types, message } = task.grantTypedData;
    return request(ctx.app).post(`/api/tasks/${task.id}/authorize`).set(bearer(ctx.token)).send({ signature: await signer.signTypedData(domain, types, message) });
  }

  async function pump(ctx, rounds = 4, gapMs = 300) {
    for (let i = 0; i < rounds; i++) {
      await ctx.container.scheduler.tick();
      await ctx.container.executor.whenIdle();
      await sleep(gapMs);
    }
  }

  const getTask = async (ctx, id) => (await request(ctx.app).get(`/api/tasks/${id}`).set(bearer(ctx.token)).expect(200)).body.data;

  test('scheduled intent -> future execution: an authorized one-time task runs autonomously within its grant', async () => {
    const ctx = await setup();
    await allowAuto(ctx, ethers.parseEther('0.005'));
    const task = (await createTask(ctx, { amount: '0.002', schedule: { type: 'once', at: now() + 2 } }).expect(201)).body.data;
    assert.equal(task.status, 'PENDING_AUTHORIZATION');
    await ctx.container.scheduler.tick();
    assert.equal((await getTask(ctx, task.id)).runs.length, 0, 'unauthorized task never runs');

    const authorized = (await authorize(ctx, task)).body.data;
    assert.equal(authorized.status, 'ACTIVE');
    await ctx.container.scheduler.tick();
    assert.equal((await getTask(ctx, task.id)).runs.length, 0, 'not due yet');

    const before = await chain.provider.getBalance(fx.payeeA.address);
    await sleep(2200);
    await pump(ctx);
    const t = await getTask(ctx, task.id);
    assert.equal(t.runs.length, 1);
    assert.equal(t.runs[0].status, 'CONFIRMED', JSON.stringify(t.runs[0]));
    assert.equal(t.status, 'COMPLETED');
    assert.equal(t.runs[0].decision.outcome, 'AUTO_APPROVED');
    const p = (await request(ctx.app).get(`/api/proposals/${t.runs[0].proposalId}`).set(bearer(ctx.token))).body.data;
    assert.equal(p.approvalKind, 'TASK_GRANT');
    assert.equal(p.approvedBy, `task:${task.id}`);
    assert.equal(p.source, 'TASK');
    assert.equal((await chain.provider.getBalance(fx.payeeA.address)) - before, ethers.parseEther('0.002'));
    const receipt = await chain.provider.getTransactionReceipt(p.execution.txHash);
    assert.equal(receipt.from, fx.agent.address);
    const audit = (await request(ctx.app).get('/api/audit').set(bearer(ctx.token))).body.data.map((a) => a.action);
    for (const a of ['TASK_CREATED', 'TASK_AUTHORIZED', 'TASK_RUN_CREATED', 'PROPOSAL_APPROVED_BY_GRANT', 'TASK_RUN_AUTO_APPROVED', 'EXECUTION_CONFIRMED', 'TASK_RUN_CONFIRMED']) assert.ok(audit.includes(a), a);
    await ctx.container.close();
  });

  test('runs above the auto-approval limit escalate to the owner and execute only after owner approval', async () => {
    const ctx = await setup();
    const task = (await createTask(ctx, { amount: '0.003' }).expect(201)).body.data; // no auto limit configured
    assert.equal((await authorize(ctx, task)).status, 200);
    await sleep(1200);
    await pump(ctx, 2);
    let t = await getTask(ctx, task.id);
    assert.equal(t.runs[0].status, 'ESCALATED');
    assert.equal(t.runs[0].decision.outcome, 'ESCALATED');
    assert.ok(t.runs[0].decision.approvalRoute.reasons.some((r) => /auto-approval limit/.test(r)));
    const p = (await request(ctx.app).get(`/api/proposals/${t.runs[0].proposalId}`).set(bearer(ctx.token))).body.data;
    assert.equal(p.status, 'AWAITING_APPROVAL');
    await request(ctx.app).post(`/api/proposals/${p.id}/approve`).set(bearer(ctx.token)).set('Idempotency-Key', idemKey()).send({ signature: await signApproval(fx.owner, p) }).expect(200);
    await pump(ctx, 3);
    t = await getTask(ctx, task.id);
    assert.equal(t.runs[0].status, 'CONFIRMED');
    await ctx.container.close();
  });

  test('unauthorized intents are blocked: bad grant signer, other-task grant, viewer, over-cap, non-allowlisted, unbounded', async () => {
    const ctx = await setup();
    const a = (await createTask(ctx, {}).expect(201)).body.data;
    const b = (await createTask(ctx, {}).expect(201)).body.data;
    assert.equal((await authorize(ctx, a, fx.outsider)).status, 401, 'grant signed by a non-owner key');
    const { domain, types, message } = b.grantTypedData;
    const otherSig = await fx.owner.signTypedData(domain, types, message);
    assert.equal((await request(ctx.app).post(`/api/tasks/${a.id}/authorize`).set(bearer(ctx.token)).send({ signature: otherSig })).status, 401, 'grant for a different task');
    const viewer = await signIn(ctx.app, fx.outsider);
    assert.equal((await request(ctx.app).post('/api/tasks').set(bearer(viewer)).send({ token: ETH, recipient: fx.payeeA.address, amount: '0.001', validUntil: now() + 100, schedule: { type: 'once', at: now() + 5 } })).status, 403);
    assert.equal((await createTask(ctx, { amount: '0.02' })).body.error.code, 'ABOVE_PER_TX_CAP');
    assert.equal((await createTask(ctx, { recipient: fx.outsider.address })).body.error.code, 'RECIPIENT_NOT_ALLOWLISTED');
    assert.equal((await createTask(ctx, { schedule: { type: 'interval', everySeconds: 60, startAt: now() + 5 } })).body.error.code, 'UNBOUNDED_TASK');
    assert.equal((await createTask(ctx, { schedule: { type: 'once', at: now() + 1 }, overrideState: {} })).status, 400, 'strict schema');
    await sleep(1200);
    await pump(ctx, 2);
    assert.equal((await getTask(ctx, a.id)).runs.length, 0);
    await ctx.container.close();
  });

  test('duplicate scheduler invocation -> exactly one execution', async () => {
    const ctx = await setup();
    await allowAuto(ctx, ethers.parseEther('0.005'));
    const task = (await createTask(ctx, { amount: '0.0015' }).expect(201)).body.data;
    assert.equal((await authorize(ctx, task)).status, 200);
    const c = ctx.container;
    const second = createSchedulerService({
      config: ctx.config, repos: c.repos, chain: c.chain, auth: c.auth, proposals: c.proposals, policySettings: c.policySettings,
      timing: c.timing, agentControl: c.agentControl, logger: createLogger('silent'), instanceId: 'second-instance',
    });
    await sleep(1200);
    for (let i = 0; i < 4; i++) {
      await Promise.all([c.scheduler.tick(), second.tick(), c.scheduler.tick(), second.tick()]);
      await c.executor.whenIdle();
      await sleep(200);
    }
    const t = await getTask(ctx, task.id);
    assert.equal(t.runs.length, 1);
    assert.equal(t.runs[0].status, 'CONFIRMED');
    const intent = (await request(ctx.app).get(`/api/proposals/${t.runs[0].proposalId}`).set(bearer(ctx.token))).body.data.intentId;
    assert.equal((await fx.wallet.queryFilter(fx.wallet.filters.TransferExecuted(intent))).length, 1);
    const proposalsForTask = (await c.db.query('SELECT count(*)::int AS n FROM proposals WHERE task_run_id = $1', [t.runs[0].id])).rows[0].n;
    assert.equal(proposalsForTask, 1);
    await ctx.container.close();
  });

  test('agent pause and automation pause stop further execution; resume continues', async () => {
    const ctx = await setup();
    await allowAuto(ctx, ethers.parseEther('0.005'));
    const task = (await createTask(ctx, { amount: '0.001' }).expect(201)).body.data;
    assert.equal((await authorize(ctx, task)).status, 200);
    await request(ctx.app).post('/api/agent/pause').set(bearer(ctx.token)).send({ reason: 'drill' }).expect(200);
    await sleep(1200);
    await pump(ctx, 2);
    assert.equal((await getTask(ctx, task.id)).runs.length, 0, 'agent paused: nothing runs');
    await request(ctx.app).post('/api/agent/resume').set(bearer(ctx.token)).send({}).expect(200);
    await request(ctx.app).post('/api/automation/pause').set(bearer(ctx.token)).send({ reason: 'drill' }).expect(200);
    await pump(ctx, 2);
    assert.equal((await getTask(ctx, task.id)).runs.length, 0, 'automation paused: nothing runs');
    await request(ctx.app).post('/api/automation/resume').set(bearer(ctx.token)).send({}).expect(200);
    await pump(ctx, 3);
    assert.equal((await getTask(ctx, task.id)).runs[0].status, 'CONFIRMED');
    await ctx.container.close();
  });

  test('process restart -> a run left CLAIMED by a crash is recovered and executes exactly once', async () => {
    const dir = tempDir('aw-sched-restart-');
    const ctx = await setup({ PGLITE_DIR: dir });
    await allowAuto(ctx, ethers.parseEther('0.005'));
    const task = (await createTask(ctx, { amount: '0.0012' }).expect(201)).body.data;
    assert.equal((await authorize(ctx, task)).status, 200);
    // Simulate a crash after the run was claimed and the grant reserved, but before a proposal existed.
    const { repos } = ctx.container;
    const { run } = await repos.runs.getOrCreate({ taskId: task.id, scheduledFor: now(), deadlineAt: now() });
    await repos.runs.claim(run.id, ['PENDING'], 0);
    await repos.tasks.reserveRun(task.id, task.amountWei);
    await repos.runs.update(run.id, { decision: { reserved: true } });
    await repos.tasks.update(task.id, { nextRunAt: null });
    await ctx.container.close();

    await sleep(5500); // lease/claim staleness window (TASK_LEASE_SECONDS=5)
    const ctx2 = await setup({ PGLITE_DIR: dir });
    await pump(ctx2, 3);
    const t = await getTask(ctx2, task.id);
    assert.equal(t.runs.length, 1);
    assert.equal(t.runs[0].status, 'CONFIRMED', JSON.stringify(t.runs[0]));
    assert.equal(t.runsCount, 1, 'grant reservation counted once after recovery');
    const audit = (await request(ctx2.app).get('/api/audit').set(bearer(ctx2.token))).body.data.map((a) => a.action);
    assert.ok(audit.includes('TASK_RUN_RECOVERED'));
    await ctx2.container.close();
  });

  test('transaction failure on-chain -> FAILED run, failure codes and audit records', async () => {
    const ctx = await setup();
    await allowAuto(ctx, ethers.parseEther('0.005'));
    const task = (await createTask(ctx, { amount: '0.001', retryMaxAttempts: 1 }).expect(201)).body.data;
    assert.equal((await authorize(ctx, task)).status, 200);
    await sleep(1200);
    await chain.send('evm_setAutomine', [false]);
    try {
      await ctx.container.scheduler.tick(); // creates run + approves by grant; executor broadcasts into the mempool
      const txHash = await waitFor(async () => {
        const t = await getTask(ctx, task.id);
        const p = t.runs[0]?.proposalId && (await request(ctx.app).get(`/api/proposals/${t.runs[0].proposalId}`).set(bearer(ctx.token))).body.data;
        return p?.execution?.txHash || null;
      });
      // The owner pauses the contract with a higher tip; both land in the same block and the agent tx reverts.
      const pauseTx = await fx.wallet.connect(fx.ownerSigner).pause({ maxPriorityFeePerGas: ethers.parseUnits('50', 'gwei'), maxFeePerGas: ethers.parseUnits('100', 'gwei') });
      await chain.send('evm_mine', []);
      const r = await chain.provider.getTransactionReceipt(txHash);
      assert.equal(r.status, 0, 'agent transaction reverted on-chain');
      assert.equal((await chain.provider.getTransactionReceipt(pauseTx.hash)).status, 1);
    } finally {
      await chain.send('evm_setAutomine', [true]);
    }
    await ctx.container.executor.whenIdle();
    await pump(ctx, 2);
    const t = await getTask(ctx, task.id);
    assert.equal(t.runs[0].status, 'FAILED');
    assert.equal(t.runs[0].errorCode, 'TX_REVERTED');
    assert.equal(t.consecutiveFailures, 1);
    assert.equal(t.runsCount, 0, 'grant reservation released after a revert');
    const p = (await request(ctx.app).get(`/api/proposals/${t.runs[0].proposalId}`).set(bearer(ctx.token))).body.data;
    assert.equal(p.status, 'FAILED');
    assert.equal(p.execution.errorCode, 'TX_REVERTED');
    const audit = (await request(ctx.app).get('/api/audit').set(bearer(ctx.token))).body.data.map((a) => a.action);
    assert.ok(audit.includes('EXECUTION_FAILED') && audit.includes('TASK_RUN_FAILED'));
    await (await fx.wallet.connect(fx.ownerSigner).unpause()).wait();
    await ctx.container.close();
  });

  test('circuit breaker pauses a task after consecutive failed runs', async () => {
    const ctx = await setup();
    await allowAuto(ctx, ethers.parseEther('0.005'));
    await request(ctx.app).put('/api/policy').set(bearer(ctx.token)).send({ circuitBreaker: { maxConsecutiveFailures: 1 } }).expect(200);
    await (await fx.wallet.connect(fx.ownerSigner).setRecipient(fx.payeeB.address, true)).wait();
    const task = (await createTask(ctx, { recipient: fx.payeeB.address, amount: '0.001', schedule: { type: 'interval', everySeconds: 30, startAt: now() + 1 }, maxRuns: 3 }).expect(201)).body.data;
    assert.equal((await authorize(ctx, task)).status, 200);
    await (await fx.wallet.connect(fx.ownerSigner).setRecipient(fx.payeeB.address, false)).wait(); // removed after authorization
    await sleep(1200);
    await pump(ctx, 2);
    const t = await getTask(ctx, task.id);
    assert.equal(t.runs[0].status, 'FAILED');
    assert.equal(t.runs[0].decision.outcome, 'REJECTED');
    assert.ok(t.runs[0].decision.blockedBy.some((b) => b.id === 'RECIPIENT_ALLOWLISTED'));
    assert.equal(t.status, 'PAUSED');
    assert.match(t.statusReason, /Circuit breaker/);
    await ctx.container.close();
  });

  test('hourly autonomous outflow cap escalates and pauses automation', async () => {
    const ctx = await setup();
    await allowAuto(ctx, ethers.parseEther('0.005'));
    await request(ctx.app).put('/api/policy').set(bearer(ctx.token)).send({ circuitBreaker: { hourlyAutonomousOutflow: { [ETH]: ethers.parseEther('0.0001').toString() } } }).expect(200);
    const task = (await createTask(ctx, { amount: '0.001' }).expect(201)).body.data;
    assert.equal((await authorize(ctx, task)).status, 200);
    await sleep(1200);
    await pump(ctx, 2);
    const t = await getTask(ctx, task.id);
    assert.equal(t.runs[0].status, 'ESCALATED');
    assert.ok(t.runs[0].decision.approvalRoute.reasons.some((r) => /circuit-breaker/.test(r)));
    assert.equal((await request(ctx.app).get('/api/automation').set(bearer(ctx.token))).body.data.paused, true);
    await ctx.container.close();
  });

  test('conditional trigger: waits while gas is above the threshold, runs once it is met', async () => {
    const ctx = await setup({ CONDITION_CHECK_SECONDS: '1' });
    await allowAuto(ctx, ethers.parseEther('0.005'));
    const strict = (await createTask(ctx, { condition: { type: 'gas_below_gwei', gwei: '0.000000001' } }).expect(201)).body.data;
    const loose = (await createTask(ctx, { condition: { type: 'gas_below_gwei', gwei: '10000' } }).expect(201)).body.data;
    assert.equal(strict.kind, 'CONDITIONAL');
    assert.equal((await authorize(ctx, strict)).status, 200);
    assert.equal((await authorize(ctx, loose)).status, 200);
    await sleep(1200);
    await pump(ctx, 3);
    const s = await getTask(ctx, strict.id);
    assert.equal(s.runs.length, 0);
    assert.match(s.statusReason, /Waiting for condition/);
    const l = await getTask(ctx, loose.id);
    assert.equal(l.runs[0].status, 'CONFIRMED');
    assert.equal(l.status, 'COMPLETED');
    await ctx.container.close();
  });

  test('RL timing: a WAIT advice defers inside the window; a model outage executes with the reason recorded', async () => {
    let advice = 'WAIT';
    let calls = 0;
    const rl = await stubRl((req) => {
      if (req.url === '/health') return { body: { status: 'healthy', task: 'execution_timing', policies: { PPO: 'available', DQN: 'available' } } };
      calls += 1;
      return { body: { agentType: 'PPO', status: 'ok', advice, modelVersion: 'ppo-timing-test', observation: [0, 0, 0, 0, 1, 0, 1, 0], actionProbabilities: [0.7, 0.3] } };
    });
    const ctx = await setup({ RL_SERVICE_URL: rl.url, GAS_SAMPLE_INTERVAL_SECONDS: '60' });
    await allowAuto(ctx, ethers.parseEther('0.005'));
    for (let i = 0; i < 4; i++) await ctx.container.repos.market.addGasSample({ chainId: 31337, blockNumber: i, gasPriceWei: String(1_000_000_000 + i * 1000), baseFeeWei: null });
    const task = (await createTask(ctx, { amount: '0.001', executionWindowSeconds: 600, useRlTiming: true }).expect(201)).body.data;
    assert.equal((await authorize(ctx, task)).status, 200);
    await sleep(1200);
    await pump(ctx, 2);
    let t = await getTask(ctx, task.id);
    assert.equal(t.runs[0].status, 'DEFERRED');
    assert.equal(t.runs[0].timingAdvice.modelVersion, 'ppo-timing-test');
    assert.equal(t.runs[0].decision.outcome, 'DEFERRED');
    assert.ok(calls >= 1);
    advice = 'EXECUTE_NOW';
    await pump(ctx, 3);
    t = await getTask(ctx, task.id);
    assert.equal(t.runs[0].status, 'CONFIRMED');
    await ctx.container.close();
    await rl.close();

    // Outage: RL unreachable -> run proceeds, and the decision records that no model advice was used.
    const ctx2 = await setup({ RL_SERVICE_URL: 'http://127.0.0.1:9', GAS_SAMPLE_INTERVAL_SECONDS: '60' });
    const tooShort = await createTask(ctx2, { executionWindowSeconds: 60, useRlTiming: true });
    assert.equal(tooShort.body.error.code, 'WINDOW_TOO_SHORT_FOR_RL');
    await allowAuto(ctx2, ethers.parseEther('0.005'));
    for (let i = 0; i < 3; i++) await ctx2.container.repos.market.addGasSample({ chainId: 31337, blockNumber: i, gasPriceWei: '1000000000', baseFeeWei: null });
    const task2 = (await createTask(ctx2, { amount: '0.001', executionWindowSeconds: 600, useRlTiming: true }).expect(201)).body.data;
    assert.equal((await authorize(ctx2, task2)).status, 200);
    await sleep(1200);
    await pump(ctx2, 3);
    const t2 = await getTask(ctx2, task2.id);
    assert.equal(t2.runs[0].status, 'CONFIRMED');
    assert.equal(t2.runs[0].timingAdvice.status, 'unavailable');
    assert.match(t2.runs[0].timingAdvice.reason, /executing without timing advice/);
    await ctx2.container.close();
  });
});

describe('portfolio and risk intelligence', () => {
  let chain, fx;
  before(async () => {
    chain = await startTestChain();
    fx = await deployFixture(chain.provider);
  });
  after(async () => chain?.stop());

  test('valuation is sourced from the configured feeds; allocation, targets, exposure and spending are computed from chain data', async () => {
    const ctx = await buildTestApp({ rpcUrl: chain.rpcUrl, deployment: fx.deployment });
    const token = await signIn(ctx.app, fx.owner);
    const o = (await request(ctx.app).get('/api/portfolio').set(bearer(token)).expect(200)).body.data;
    assert.equal(o.valuationComplete, true);
    assert.equal(o.totalUsd, '25000.00'); // 5 ETH x $3000 + 10,000 mUSDC x $1 (synthetic local feeds)
    const eth = o.assets.find((a) => a.symbol === 'ETH');
    assert.equal(eth.price.usd, '3000.0');
    assert.match(eth.price.source, /synthetic/);
    assert.equal(eth.allocationPct, 60);
    await request(ctx.app).put('/api/portfolio/targets').set(bearer(token)).send({ targets: { [ETH]: 40, [fx.deployment.tokens[1].address]: 60 } }).expect(200);
    const o2 = (await request(ctx.app).get('/api/portfolio').set(bearer(token))).body.data;
    assert.equal(o2.assets.find((a) => a.symbol === 'ETH').driftPct, 20);
    const drift = o2.suggestions.find((s) => s.kind === 'ALLOCATION_DRIFT');
    assert.equal(drift.actionable, 'not_supported');
    assert.match(drift.message, /does not execute swaps/);

    const p = (await request(ctx.app).post('/api/proposals').set(bearer(token)).send({ token: ETH, recipient: fx.payeeA.address, amount: '0.004' }).expect(201)).body.data;
    await request(ctx.app).post(`/api/proposals/${p.id}/approve`).set(bearer(token)).set('Idempotency-Key', idemKey()).send({ signature: await signApproval(fx.owner, p) }).expect(200);
    await ctx.container.executor.whenIdle();
    await ctx.container.indexer.syncOnce();
    const s = (await request(ctx.app).get('/api/portfolio/spending?days=7').set(bearer(token)).expect(200)).body.data;
    assert.equal(s.totals.ETH, '0.004');
    assert.equal(s.byCategory.supplier.ETH, '0.004');
    assert.ok(s.events.some((e) => e.category === 'DEPOSIT'));

    assert.equal(await ctx.container.portfolio.takeSnapshotIfDue(), true);
    const h = (await request(ctx.app).get('/api/portfolio/history').set(bearer(token))).body.data;
    assert.equal(h.points.ETH.length, 1);
    assert.equal(h.points.ETH[0].priceUsd, '3000');
    await ctx.container.close();
  });

  test('USD aggregate daily limit enforces across assets and fails closed when prices are stale', async () => {
    const ctx = await buildTestApp({ rpcUrl: chain.rpcUrl, deployment: fx.deployment, env: { PRICE_MAX_AGE_SECONDS: '3600' } });
    const token = await signIn(ctx.app, fx.owner);
    await request(ctx.app).put('/api/policy').set(bearer(token)).send({ dailyUsdLimit: '20.00' }).expect(200);
    // spent today 0.004 ETH ($12) from the previous test; 0.002 ETH ($6) fits, 0.003 ETH ($9) does not.
    const ok = (await request(ctx.app).post('/api/proposals').set(bearer(token)).send({ token: ETH, recipient: fx.payeeA.address, amount: '0.002' }).expect(201)).body.data;
    assert.equal(ok.status, 'AWAITING_APPROVAL', JSON.stringify(ok.policyResult.violations));
    const over = (await request(ctx.app).post('/api/proposals').set(bearer(token)).send({ token: ETH, recipient: fx.payeeA.address, amount: '0.003' }).expect(201)).body.data;
    assert.ok(over.policyResult.violations.some((v) => v.id === 'USD_DAILY_LIMIT'));
    await chain.send('evm_increaseTime', [7200]);
    await chain.send('evm_mine', []);
    const stale = (await request(ctx.app).post('/api/proposals').set(bearer(token)).send({ token: ETH, recipient: fx.payeeA.address, amount: '0.0001' }).expect(201)).body.data;
    const v = stale.policyResult.violations.find((x) => x.id === 'USD_DAILY_LIMIT');
    assert.ok(v, 'fails closed on stale price');
    await ctx.container.close();
  });

  test('contract recipients are blocked unless explicitly allowed, and loosening requires console confirmation', async () => {
    const ctx = await buildTestApp({ rpcUrl: chain.rpcUrl, deployment: fx.deployment });
    const token = await signIn(ctx.app, fx.owner);
    const R = artifact('RevertingRecipient', 'mocks', 'AdversarialRecipients');
    const rec = await new ethers.ContractFactory(R.abi, R.bytecode, fx.ownerSigner).deploy();
    await rec.waitForDeployment();
    await (await fx.wallet.connect(fx.ownerSigner).setRecipient(await rec.getAddress(), true)).wait();
    const p = (await request(ctx.app).post('/api/proposals').set(bearer(token)).send({ token: ETH, recipient: await rec.getAddress(), amount: '0.0001' }).expect(201)).body.data;
    assert.ok(p.policyResult.violations.some((v) => v.id === 'RECIPIENT_TYPE'));
    const refused = await request(ctx.app).put('/api/policy').set(bearer(token)).send({ allowContractRecipients: true });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error.code, 'LOOSENING_REQUIRES_OWNER_CONSOLE');
    await request(ctx.app).put('/api/policy').set(bearer(token)).send({ allowContractRecipients: true, confirmLoosening: true }).expect(200);
    const p2 = (await request(ctx.app).post('/api/proposals').set(bearer(token)).send({ token: ETH, recipient: await rec.getAddress(), amount: '0.0001' }).expect(201)).body.data;
    assert.ok(p2.policyResult.violations.some((v) => v.id === 'SIMULATION'), 'simulation still catches the reverting recipient');
    await ctx.container.close();
  });
});
