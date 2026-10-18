import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { ethers } from 'ethers';
import { startTestChain, devWallet, artifact } from './helpers/chain.js';
import { tempDir } from './helpers/app.js';
import { scriptedProvider, call } from './helpers/scriptedLlm.js';
import { openDatabase } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { createLogger } from '../src/lib/logger.js';
import { createRateLimits } from '../src/middleware/rateLimits.js';
import { requestId, createErrorHandler, notFoundHandler } from '../src/middleware/errorHandler.js';
import { createDemoRuntime } from '../src/sandbox/demoRuntime.js';
import { createDemoRouter } from '../src/routes/demo.js';
import { DEMO_MAX_MODEL_CALLS } from '../src/services/demoService.js';

/**
 * Regressions for the stopped live attempt of 2026-10-18 (LOCAL chain; nothing public):
 *  1. Production env ceilings were still 0 while the persisted limits were open. The confirmation was refused with
 *     DEMO_DAILY_LIMIT after the shared daily row had been charged, and that charge was never refunded.
 *  2. GPT-4.1-mini called prepare_treasury_payment before record_plan; the 4-call cap ended the turn before recovery.
 * The persisted limits are written with the same SQL merge used in production, and fees are Sepolia-like (tens of wei)
 * so the real 0.00001 ETH gas ceilings apply.
 */
const ETH = ethers.ZeroAddress;
const W = (v) => ethers.parseEther(v);
const MIGRATIONS = path.resolve(import.meta.dirname, '..', '..', 'database', 'migrations');
const logger = createLogger('silent');
const OPEN_SQL = `UPDATE demo_settings SET limits = limits || '{"maxTxPerSession":1,"dailyTxLimit":1,"dailyAmountEth":"0.0001","maxGasPerTxEth":"0.00001","sessionGasEth":"0.00001","dailyGasEth":"0.00001"}'::jsonb WHERE id=1`;
const ZERO_SQL = `UPDATE demo_settings SET limits = limits || '{"maxTxPerSession":0,"dailyTxLimit":0,"dailyAmountEth":"0","maxGasPerTxEth":"0","sessionGasEth":"0","dailyGasEth":"0"}'::jsonb WHERE id=1`;

async function setup({ envCeilings, script }) {
  const chain = await startTestChain();
  const owner = devWallet(5), agent = devWallet(6), recipient = devWallet(7);
  const signer = new ethers.NonceManager(devWallet(0, chain.provider));
  const A = artifact('AgentWallet');
  const wallet = await new ethers.ContractFactory(A.abi, A.bytecode, signer).deploy(owner.address, agent.address, W('0.0001'), W('0.0003'));
  await wallet.waitForDeployment();
  const contract = await wallet.getAddress();
  await (await signer.sendTransaction({ to: contract, value: W('0.0004') })).wait();
  await (await wallet.connect(owner.connect(chain.provider)).setRecipient(recipient.address, true)).wait();
  const deploymentFile = path.join(tempDir('aw-prodsem-'), 'sandbox.json');
  fs.writeFileSync(deploymentFile, JSON.stringify({ chainId: 31337, contractAddress: contract, contractVersion: 2, tokens: [{ symbol: 'ETH', address: ETH, decimals: 18, native: true }], demoRecipients: [{ label: 'Approved recipient', category: 'supplier', address: recipient.address }] }));
  // Production values: minimum treasury 0.0002, agent gas minimum 0.0005, fee cap 20 gwei; ceilings per test.
  const demo = { enabled: true, deploymentFile, contractAddress: contract, ownerAddress: owner.address, agentAddress: agent.address, inviteHashes: [],
    sessionTtlSeconds: 3600, maxAiPerSession: 6, maxAmountWei: W('0.0001'), minTreasuryEth: '0.0002', minAgentGasEth: '0.0005', maxFeePerGasGwei: '20', executionWaitMs: 30000, ...envCeilings };
  Object.defineProperty(demo, 'ownerKey', { value: owner.privateKey, enumerable: false });
  Object.defineProperty(demo, 'agentKey', { value: agent.privateKey, enumerable: false });
  const budgetDb = await openDatabase({ pgliteDir: 'memory://' });
  await migrate(budgetDb, MIGRATIONS);
  const llm = scriptedProvider(script);
  const runtime = await createDemoRuntime({ nodeEnv: 'test', logLevel: 'silent', appOrigin: 'http://localhost:5173', corsOrigins: ['http://localhost:5173'], chainId: 31337,
    rpcUrl: chain.rpcUrl, databaseUrl: null, pgliteDir: 'memory://', migrationsDir: MIGRATIONS, publicAi: { dailyLimit: 30 }, demo },
  { db: budgetDb, llm, logger, extraEnv: { RECEIPT_TIMEOUT_MS: '20000', DAY_BOUNDARY_GUARD_SECONDS: '0', CONFIRMATIONS: '1' } });
  assert.ok(runtime.service, runtime.reason);
  const box = runtime.sandbox.container;
  await box.policySettings.update({ reserveFloors: { [ETH]: W('0.0003').toString() } }, owner.address, { via: 'test-admin' });
  // Sepolia-like fees: base fee of a few wei, 2 wei priority (preflight read 32–34 wei maxFee).
  await chain.send('hardhat_setNextBlockBaseFeePerGas', ['0x2']);
  box.chain.provider.getFeeData = async () => new ethers.FeeData(32n, 64n, 2n);
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use('/api/demo', createDemoRouter({ demoRuntime: runtime, limits: createRateLimits({ disabled: true }) }));
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger, { production: false }));
  const close = async () => { await runtime.close(); await budgetDb.close(); await chain.stop(); };
  return { chain, owner, agent, recipient, contract, runtime, box, app, llm, close, rootDb: budgetDb };
}

const auth = (s) => ({ Authorization: `Bearer ${s.token}` });
const bill = (to, label, priority) => ({ recipientLabel: label, recipient: to, amount: '0.0001', dueAt: new Date(Date.now() + 86400000).toISOString(), priority, description: '' });
const usageToday = async (db) => (await db.query(`SELECT tx_count, amount_wei::text FROM demo_daily_usage WHERE day = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date`)).rows[0] || null;

describe('incident configuration: env ceilings 0, persisted limits opened by SQL', () => {
  let t;
  before(async () => { t = await setup({ envCeilings: { maxTxPerSession: 0, dailyTxLimit: 0, dailyAmountWei: 0n, maxGasPerTxWei: 0n, sessionGasWei: 0n, dailyGasWei: 0n }, script: [] }); await t.box.db.query(OPEN_SQL); });
  after(async () => { await t?.close(); });

  test('a refused, unsigned confirmation leaves the shared daily usage, session count and chain untouched', async () => {
    const code = (await t.runtime.service.createInvite({ label: 'incident', maxSessions: 1 }, t.owner.address)).code;
    await t.runtime.service.setExecutionEnabled(true, t.owner.address);
    const s = (await request(t.app).post('/api/demo/session').send({ inviteCode: code }).expect(200)).body.data;
    const o = (await request(t.app).post('/api/demo/sandbox/treasury/obligations').set(auth(s)).send(bill(t.recipient.address, 'A', 'HIGH')).expect(200)).body.data;
    const p = (await request(t.app).post(`/api/demo/sandbox/treasury/obligations/${o.id}/prepare`).set(auth(s)).send({}).expect(200)).body.data.proposal;
    const nonce = await t.chain.provider.getTransactionCount(t.agent.address);
    const res = await request(t.app).post(`/api/demo/sandbox/proposals/${p.id}/confirm`).set(auth(s)).send({ confirm: true, recipient: p.recipient, amountWei: p.amountWei }).expect(429);
    assert.equal(res.body.error.code, 'DEMO_DAILY_LIMIT');
    assert.equal(await usageToday(t.box.db), null, 'no daily usage charged for a refused, unsigned attempt');
    assert.equal((await t.box.db.query('SELECT tx_count FROM demo_sessions WHERE id=$1', [s.sessionId])).rows[0].tx_count, 0);
    assert.equal((await t.rootDb.query('SELECT count(*)::int n FROM sandbox_relay_claims')).rows[0].n, 0);
    assert.equal(await t.chain.provider.getTransactionCount(t.agent.address), nonce, 'nothing signed or sent');
    assert.equal((await t.box.proposals.get(p.id)).status, 'AWAITING_APPROVAL');
  });
});

describe('applied configuration: env 1/1/0.0001/0.00001×3 plus persisted limits, live AI sequence, A/B', () => {
  let t, s, a, b;
  const script = [];
  before(async () => {
    t = await setup({ envCeilings: { maxTxPerSession: 1, dailyTxLimit: 1, dailyAmountWei: W('0.0001'), maxGasPerTxWei: W('0.00001'), sessionGasWei: W('0.00001'), dailyGasWei: W('0.00001') }, script });
    await t.box.db.query(OPEN_SQL);
    const code = (await t.runtime.service.createInvite({ label: 'retry', maxSessions: 1, expiresInHours: 1 }, t.owner.address)).code;
    await t.runtime.service.setExecutionEnabled(true, t.owner.address);
    s = (await request(t.app).post('/api/demo/session').send({ inviteCode: code }).expect(200)).body.data;
    a = (await request(t.app).post('/api/demo/sandbox/treasury/obligations').set(auth(s)).send(bill(t.recipient.address, 'Payment A', 'HIGH')).expect(200)).body.data;
    b = (await request(t.app).post('/api/demo/sandbox/treasury/obligations').set(auth(s)).send(bill(t.recipient.address, 'Payment B', 'NORMAL')).expect(200)).body.data;
  });
  after(async () => { await t?.close(); });

  test('the exact live tool sequence (prepare before record_plan) now recovers within the demo call budget', async () => {
    assert.equal(DEMO_MAX_MODEL_CALLS, 6);
    script.push(
      { toolCalls: [call('get_treasury_overview', { days: 7 })] },
      { toolCalls: [call('generate_treasury_plan', { days: 7 })] },
      { toolCalls: [call('prepare_treasury_payment', { obligation_id: a.id })] },
      { toolCalls: [call('record_plan', { goal: 'Prepare the payment that fits', steps: [{ description: 'Prepare A', tool: 'prepare_treasury_payment' }] })] },
      { toolCalls: [call('prepare_treasury_payment', { obligation_id: a.id })] },
      { text: 'Payment A is prepared for your confirmation; Payment B is deferred to protect the reserve.' },
    );
    const turn = (await request(t.app).post('/api/demo/sandbox/agent/chat').set(auth(s)).send({ message: 'Review my treasury obligations, generate the payment plan, and prepare only the payment that fits.' }).expect(200)).body.data;
    assert.equal(turn.status, 'COMPLETED');
    assert.equal(turn.modelCalls, 6);
    assert.deepEqual(turn.actions.map((x) => x.type), ['rejected', 'proposal'], 'the early call is still rejected by trusted code');
    assert.equal(turn.proposals.length, 1);
    assert.equal(turn.proposals[0].id, a.id);
    assert.equal(turn.proposals[0].status, 'AWAITING_APPROVAL');
    const req = t.llm.requests[0];
    assert.match(req.system, /Never call prepare_treasury_payment before record_plan/);
    assert.match(req.tools.find((x) => x.name === 'prepare_treasury_payment').description, /Requires record_plan earlier in this turn/);
  });

  test('A executes once within the 0.00001 ETH gas ceilings; usage is charged exactly once', async () => {
    const p = (await request(t.app).get(`/api/demo/sandbox/proposals/${a.id}`).set(auth(s)).expect(200)).body.data;
    const res = await request(t.app).post(`/api/demo/sandbox/proposals/${a.id}/confirm`).set(auth(s)).send({ confirm: true, recipient: p.recipient, amountWei: p.amountWei }).expect(200);
    assert.equal(res.body.data.status, 'CONFIRMED', res.body.data.resolutionReason);
    assert.equal(res.body.data.receipt.status, 1);
    assert.equal(await t.chain.provider.getBalance(t.contract), W('0.0003'));
    assert.deepEqual(await usageToday(t.box.db), { tx_count: 1, amount_wei: W('0.0001').toString() });
    const gas = (await t.rootDb.query(`SELECT subject, tx_count, gas_wei::text FROM sandbox_relay_usage`)).rows;
    assert.ok(gas.length === 2 && gas.every((r) => r.tx_count === 1 && BigInt(r.gas_wei) > 0n && BigInt(r.gas_wei) <= W('0.00001')), JSON.stringify(gas));
  });

  test('B is refused by the reserve with no transaction, and the exhausted quota blocks any further payment', async () => {
    const nonce = await t.chain.provider.getTransactionCount(t.agent.address);
    const pb = (await request(t.app).post(`/api/demo/sandbox/treasury/obligations/${b.id}/prepare`).set(auth(s)).send({}).expect(200)).body.data.proposal;
    assert.equal(pb.status, 'POLICY_REJECTED');
    assert.ok(pb.policyResult.violations.some((v) => v.id === 'BALANCE_AND_RESERVE'));
    await request(t.app).post(`/api/demo/sandbox/proposals/${pb.id}/confirm`).set(auth(s)).send({ confirm: true, recipient: pb.recipient, amountWei: pb.amountWei }).expect(409);
    assert.equal(await t.chain.provider.getTransactionCount(t.agent.address), nonce);
    assert.deepEqual(await usageToday(t.box.db), { tx_count: 1, amount_wei: W('0.0001').toString() }, 'unchanged');
  });

  test('cleanup: execution off and zero persisted limits stop every path', async () => {
    await t.runtime.service.setExecutionEnabled(false, t.owner.address);
    await t.box.db.query(ZERO_SQL);
    const st = (await request(t.app).get('/api/demo/sandbox/sandbox-status').set(auth(s)).expect(200)).body.data;
    assert.equal(st.executionEnabled, false);
    for (const k of ['maxTxPerSession', 'dailyTxLimit']) assert.equal(st.limits[k], 0);
    for (const k of ['dailyAmountEth', 'maxGasPerTxEth', 'sessionGasEth', 'dailyGasEth']) assert.equal(Number(st.limits[k]), 0);
  });
});
