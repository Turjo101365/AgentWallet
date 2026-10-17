import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { ethers } from 'ethers';
import { startTestChain, deployFixture, devWallet, artifact } from './helpers/chain.js';
import { buildTestApp, signIn, bearer, tempDir } from './helpers/app.js';
import { scriptedProvider, call } from './helpers/scriptedLlm.js';
import { openDatabase } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { createLogger } from '../src/lib/logger.js';
import { createRateLimits } from '../src/middleware/rateLimits.js';
import { requestId, createErrorHandler, notFoundHandler } from '../src/middleware/errorHandler.js';
import { createDemoRuntime } from '../src/sandbox/demoRuntime.js';
import { createDemoRouter } from '../src/routes/demo.js';
import { createAdminRouter } from '../src/routes/admin.js';
import { createPersonalRouter } from '../src/routes/personal.js';
import { createRelayGuard } from '../src/sandbox/relayGuard.js';

/**
 * Judge demo wallet on a throwaway local chain: invite gating, authorization boundaries, every server-side limit,
 * one-at-a-time execution, and a real executed transfer with its receipt. The LLM is scripted (no paid calls).
 */
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const ETH = ethers.ZeroAddress;
let INVITE = 'invite-good-1';
const MIGRATIONS = path.resolve(import.meta.dirname, '..', '..', 'database', 'migrations');
const logger = createLogger('silent');

async function deploySandbox(provider, { owner, agent, recipient }) {
  const W = artifact('AgentWallet');
  const signer = new ethers.NonceManager(devWallet(0, provider));
  const wallet = await new ethers.ContractFactory(W.abi, W.bytecode, signer).deploy(owner.address, agent.address, ethers.parseEther('0.001'), ethers.parseEther('0.01'));
  await wallet.waitForDeployment();
  const address = await wallet.getAddress();
  await (await signer.sendTransaction({ to: address, value: ethers.parseEther('0.01') })).wait();
  await (await wallet.connect(owner.connect(provider)).setRecipient(recipient.address, true)).wait();
  const dir = tempDir('aw-demo-');
  const deploymentFile = path.join(dir, 'demo-sandbox.json');
  fs.writeFileSync(deploymentFile, JSON.stringify({ network: 'local-demo', chainId: 31337, contractAddress: address, contractVersion: 2,
    tokens: [{ symbol: 'ETH', address: ETH, decimals: 18, native: true }], demoRecipients: [{ label: 'Demo recipient', category: 'supplier', address: recipient.address }] }));
  return { wallet, address, deploymentFile };
}

function demoSettings({ deploymentFile, address, owner, agent }, overrides = {}) {
  const demo = {
    enabled: true, deploymentFile, contractAddress: address, ownerAddress: owner.address, agentAddress: agent.address,
    inviteHashes: [sha(INVITE)], sessionTtlSeconds: 3600, maxTxPerSession: 2, maxAiPerSession: 5,
    maxAmountWei: ethers.parseEther('0.0001'), dailyTxLimit: 3, dailyAmountWei: ethers.parseEther('0.0003'),
    minTreasuryEth: '0.0001', minAgentGasEth: '0.0001', maxFeePerGasGwei: '50', executionWaitMs: 30000,
    maxGasPerTxWei:ethers.parseEther('0.005'),sessionGasWei:ethers.parseEther('0.01'),dailyGasWei:ethers.parseEther('0.02'),...overrides,
  };
  Object.defineProperty(demo, 'ownerKey', { value: owner.privateKey, enumerable: false });
  Object.defineProperty(demo, 'agentKey', { value: agent.privateKey, enumerable: false });
  return demo;
}

/** A proposal-drafting model turn: plan, then propose_transfer, then a short answer. */
const draft = (recipient, amount) => [
  { toolCalls: [call('record_plan', { goal: 'Pay the demo recipient', steps: [{ description: 'Propose the transfer', tool: 'propose_transfer' }] })] },
  { toolCalls: [call('propose_transfer', { token: 'ETH', recipient, amount, memo: null })] },
  { text: 'Drafted. Review the risk checks and confirm to execute.' },
];

describe('demo sandbox configuration guards', () => {
  const hosted = { NODE_ENV: 'production', APP_MODE: 'judge', CHAIN_ID: '11155111', BACKGROUND_JOBS: 'false',
    DATABASE_URL: 'postgres://example:placeholder@localhost/test', APP_ORIGIN: 'https://judge.example.com', CORS_ORIGINS: 'https://judge.example.com' };
  const sandboxFile = (contractAddress, chainId = 11155111) => {
    const f = path.join(tempDir('aw-demo-cfg-'), 'sandbox.json');
    fs.writeFileSync(f, JSON.stringify({ chainId, contractAddress }));
    return f;
  };
  const keys = { DEMO_OWNER_PRIVATE_KEY: ethers.Wallet.createRandom().privateKey, DEMO_AGENT_PRIVATE_KEY: ethers.Wallet.createRandom().privateKey };
  const demoEnv = (over = {}) => ({ ...hosted, ADMIN_ADDRESSES: new ethers.Wallet(keys.DEMO_OWNER_PRIVATE_KEY).address, DEMO_ENABLED: 'true', DEMO_DEPLOYMENT_FILE: sandboxFile(ethers.Wallet.createRandom().address), ...keys, ...over });

  test('accepted only in judge mode, on a separate Sepolia contract, with two distinct non-public keys', async () => {
    const { loadConfig } = await import('../src/config/env.js');
    const c = loadConfig(demoEnv({ DEMO_INVITE_CODES_SHA256: sha('x') }));
    const dump = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
    assert.equal(c.demo.enabled, true);
    assert.equal(c.executor.enabled, false, 'the judge process itself still has no executor');
    assert.ok(!dump(c).includes(keys.DEMO_OWNER_PRIVATE_KEY.slice(2)), 'keys never serialize');
    assert.ok(!dump(c).includes(keys.DEMO_AGENT_PRIVATE_KEY.slice(2)));
    for (const frozen of ['0x8A44716Efabb6Ce401291B91D4427149CaF956a6', '0x23bAE3f3C95f9BF7391c0764B1A7dFF700f34458', '0x3C9389E704331B8a12381F9ab5A68a7F3F59582F']) {
      assert.throws(() => loadConfig(demoEnv({ DEMO_DEPLOYMENT_FILE: sandboxFile(frozen) })), /frozen evidence/);
    }
    assert.throws(() => loadConfig(demoEnv({ APP_MODE: 'operator', CHAIN_ID: '31337' })), /judge mode/);
    assert.throws(() => loadConfig(demoEnv({ DEMO_AGENT_PRIVATE_KEY: keys.DEMO_OWNER_PRIVATE_KEY })), /must differ/);
    assert.throws(() => loadConfig(demoEnv({ DEMO_OWNER_PRIVATE_KEY: devWallet(0).privateKey })), /Hardhat/);
    assert.throws(() => loadConfig(demoEnv({ DEMO_DEPLOYMENT_FILE: sandboxFile(ethers.Wallet.createRandom().address, 31337) })), /judge chain/);
    assert.throws(() => loadConfig(demoEnv({ DEMO_INVITE_CODES_SHA256: 'plaintext-code' })), /SHA-256/);
  });
});

describe('judge demo wallet (local sandbox)', () => {
  let chain, sandbox, budgetDb, runtime, app, llm, owner, agent, recipient;
  const script = [];

  before(async () => {
    chain = await startTestChain();
    owner = devWallet(5);
    agent = devWallet(6);
    recipient = devWallet(7);
    sandbox = await deploySandbox(chain.provider, { owner, agent, recipient });
    budgetDb = await openDatabase({ pgliteDir: 'memory://' });
    await migrate(budgetDb, MIGRATIONS);
    llm = scriptedProvider(script);
    const base = { nodeEnv: 'test', logLevel: 'silent', appOrigin: 'http://localhost:5173', corsOrigins: ['http://localhost:5173'], chainId: 31337,
      rpcUrl: chain.rpcUrl, databaseUrl: null, pgliteDir: 'memory://', migrationsDir: MIGRATIONS, publicAi: { dailyLimit: 30 },
      demo: demoSettings({ ...sandbox, owner, agent }) };
    runtime = await createDemoRuntime(base, { db: budgetDb, llm, logger, extraEnv: { RECEIPT_TIMEOUT_MS: '20000', DAY_BOUNDARY_GUARD_SECONDS: '0', CONFIRMATIONS: '1' } });
    assert.ok(runtime.service, runtime.reason);
    INVITE=(await runtime.service.createInvite({label:'local focused test fixture',maxSessions:100},owner.address)).code;
    app = express();
    app.use(requestId);
    app.use(express.json());
    app.use('/api/demo', createDemoRouter({ demoRuntime: runtime, limits: createRateLimits({ disabled: true }) }));
    app.use(notFoundHandler);
    app.use(createErrorHandler(logger, { production: false }));
  });

  after(async () => {
    await runtime?.close();
    await budgetDb?.close();
    await chain?.stop();
  });

  const start = async (inviteCode) => (await request(app).post('/api/demo/session').send(inviteCode ? { inviteCode } : {}).expect(200)).body.data;
  const auth = (s) => ({ Authorization: `Bearer ${s.token}` });
  async function draftPayment(s, amount = '0.0001') {
    script.push(...draft(recipient.address, amount));
    const res = await request(app).post('/api/demo/sandbox/agent/chat').set(auth(s)).send({ message: `Send ${amount} ETH to the demo recipient` }).expect(200);
    assert.equal(res.body.data.proposals.length, 1);
    return res.body.data.proposals[0];
  }
  const confirm = (s, p, body = {}) => request(app).post(`/api/demo/sandbox/proposals/${p.id}/confirm`).set(auth(s)).send({ confirm: true, recipient: p.recipient, amountWei: p.amountWei, ...body });

  test('an invalid invite is refused; a session without an invite explores and drafts but can never execute', async () => {
    await request(app).post('/api/demo/session').send({ inviteCode: 'not-a-real-code' }).expect(403).expect((r) => assert.equal(r.body.error.code, 'INVITE_INVALID'));
    const explorer = await start();
    assert.equal(explorer.executionAllowed, false);
    await request(app).get('/api/demo/sandbox/wallet/state').set(auth(explorer)).expect(200);
    const p = await draftPayment(explorer);
    assert.equal(p.status, 'AWAITING_APPROVAL');
    assert.equal(p.approvalTypedData, null, 'the server signs; the browser never gets typed data to sign');
    const nonce = await chain.provider.getTransactionCount(agent.address);
    const res = await confirm(explorer, p).expect(403);
    assert.equal(res.body.error.code, 'INVITE_REQUIRED');
    assert.equal(await chain.provider.getTransactionCount(agent.address), nonce, 'nothing sent');
  });

  test('the judge journey: AI drafts, risk checks pass, judge confirms, demo owner key signs, agent executes, receipt returned', async () => {
    const s = await start(INVITE);
    assert.equal(s.executionAllowed, true);
    const p = await draftPayment(s);
    assert.ok(p.policyResult.checks.every((c) => c.passed), 'risk review passes');
    assert.equal(p.demo.mine, true);
    const before = await chain.provider.getBalance(recipient.address);
    const res = await confirm(s, p).expect(200);
    const done = res.body.data;
    assert.equal(done.status, 'CONFIRMED', JSON.stringify(done.resolutionReason));
    assert.equal(done.receipt.status, 1);
    assert.match(done.receipt.txHash, /^0x[0-9a-f]{64}$/);
    assert.equal(done.demo.authorization.kind, 'DEMO_SERVER_KEY_AFTER_JUDGE_CONFIRMATION');
    assert.match(done.demo.authorization.label, /Your own wallet did not sign it/);
    assert.equal(done.approvedBy, owner.address);
    assert.equal(await chain.provider.getBalance(recipient.address) - before, ethers.parseEther('0.0001'));
    const tx = await chain.provider.getTransaction(done.receipt.txHash);
    assert.equal(tx.from, agent.address, 'executed by the demo agent key');
    assert.equal(tx.to, sandbox.address, 'on the sandbox contract');
    await confirm(s, p).expect(409);
  });

  test('confirmation must match the drafted proposal and come from the session that drafted it', async () => {
    const a = await start(INVITE);
    const b = await start(INVITE);
    const p = await draftPayment(a);
    await confirm(b, p).expect(403);
    const res = await confirm(a, p, { amountWei: '1' }).expect(400);
    assert.equal(res.body.error.code, 'CONFIRMATION_MISMATCH');
    await confirm(a, p, { recipient: devWallet(8).address }).expect(400);
    const status = (await request(app).get('/api/demo/status').set(auth(a)).expect(200)).body.data;
    assert.equal(status.session.txRemaining, 2, 'a refused confirmation does not use the session budget');
    // A session that has used its payments is refused before anything is signed.
    await runtime.sandbox.container.db.query('UPDATE demo_sessions SET tx_count = 2 WHERE id = $1', [a.sessionId]);
    const nonce = await chain.provider.getTransactionCount(agent.address);
    const limited = await confirm(a, p).expect(429);
    assert.equal(limited.body.error.code, 'DEMO_SESSION_TX_LIMIT');
    assert.equal(await chain.provider.getTransactionCount(agent.address), nonce, 'nothing sent');
  });

  test('amounts above the demo cap are refused before signing, even when the contract cap would allow them', async () => {
    const s = await start(INVITE);
    const p = await draftPayment(s, '0.0005');
    assert.equal(p.status, 'AWAITING_APPROVAL', 'within the contract cap of 0.001');
    const nonce = await chain.provider.getTransactionCount(agent.address);
    const res = await confirm(s, p).expect(422);
    assert.equal(res.body.error.code, 'DEMO_AMOUNT_LIMIT');
    assert.equal(await chain.provider.getTransactionCount(agent.address), nonce);
  });

  test('owner-only operator routes are refused for demo sessions, and demo tokens are not operator sessions', async () => {
    const s = await start(INVITE);
    for (const [method, url] of [['post', '/proposals'], ['put', '/policy'], ['post', '/agent/pause'], ['post', '/automation/resume'], ['post', '/auth/nonce']]) {
      const r = await request(app)[method](`/api/demo/sandbox${url}`).set(auth(s)).send({});
      assert.equal(r.status, 403, `${method} ${url}`);
    }
    await request(app).get('/api/demo/sandbox/agent/status').set(auth(s)).expect(200);
    await request(app).get('/api/demo/sandbox/wallet/state').expect(401);
    await request(app).get('/api/demo/sandbox/wallet/state').set({ Authorization: `Bearer ${'a'.repeat(64)}` }).expect(401);
  });

  test('one demo payment executes at a time; per-session and shared daily limits hold', async () => {
    const a = await start(INVITE);
    const b = await start(INVITE);
    const pa = await draftPayment(a);
    const pb = await draftPayment(b);
    const [ra, rb] = await Promise.all([confirm(a, pa), confirm(b, pb)]);
    const statuses = [ra.status, rb.status].sort();
    assert.deepEqual(statuses, [200, 409], 'the second concurrent confirmation is refused, not queued');
    assert.equal((ra.status === 409 ? ra : rb).body.error.code, 'DEMO_BUSY');
    // Daily limit is 3 transactions: 1 earlier + 1 now = 2; one more fits, then the shared limit refuses.
    const loser = ra.status === 409 ? { s: a, p: pa } : { s: b, p: pb };
    await confirm(loser.s, loser.p).expect(200);
    const c = await start(INVITE);
    const pc = await draftPayment(c);
    const res = await confirm(c, pc).expect(429);
    assert.equal(res.body.error.code, 'DEMO_DAILY_LIMIT');
    const status = (await request(app).get('/api/demo/status').set(auth(c)).expect(200)).body.data;
    assert.equal(status.today.txCount, 3);
    assert.equal(status.session.txRemaining, 2, 'the refused attempt was refunded');
  });

  test('the per-session AI limit and the shared public AI quota are enforced', async () => {
    const s = await start();
    for (let i = 0; i < 5; i++) {
      script.push({ text: 'ok' });
      await request(app).post('/api/demo/sandbox/agent/chat').set(auth(s)).send({ message: 'hello' }).expect(200);
    }
    const res = await request(app).post('/api/demo/sandbox/agent/chat').set(auth(s)).send({ message: 'hello' }).expect(429);
    assert.equal(res.body.error.code, 'DEMO_AI_LIMIT');
    const { rows } = await budgetDb.query('SELECT requests FROM judge_ai_usage');
    assert.ok(rows[0].requests >= 5, 'demo chats count against the shared public AI quota');
  });

  test('the demo assistant cannot reach tools outside its allowlist', async () => {
    const s = await start();
    script.push({ toolCalls: [call('set_reserve_floor', { token: 'ETH', amount: '1' })] }, { text: 'done' });
    const turn = (await request(app).post('/api/demo/sandbox/agent/chat').set(auth(s)).send({ message: 'raise the reserve floor' }).expect(200)).body.data;
    const req = llm.requests.at(-1);
    assert.ok(!req.tools.some((t) => ['schedule_payment', 'set_reserve_floor', 'pause_automation', 'cancel_task'].includes(t.name)), 'not offered');
    assert.equal(turn.actions.length, 0);
    const policy = (await request(app).get('/api/demo/sandbox/policy').set(auth(s)).expect(200)).body.data;
    assert.equal(JSON.stringify(policy).includes('"1000000000000000000"'), false, 'nothing changed');
  });

  test('admin: SIWE plus the server-side allowlist; kill switch and invites take effect', async () => {
    const fx = await deployFixture(chain.provider);
    const main = await buildTestApp({ rpcUrl: chain.rpcUrl, deployment: fx.deployment });
    try {
      const adminWallet = devWallet(9);
      const adminApp = express();
      adminApp.use(requestId);
      adminApp.use(express.json());
      adminApp.use('/api/admin', createAdminRouter({ config: { adminAddresses: [adminWallet.address] }, auth: main.container.auth, demoRuntime: runtime, limits: createRateLimits({ disabled: true }) }));
      adminApp.use(createErrorHandler(logger, { production: false }));

      await request(adminApp).get('/api/admin/me').expect(401);
      const outsider = await signIn(main.app, fx.owner);
      await request(adminApp).get('/api/admin/me').set(bearer(outsider)).expect(403);
      const token = await signIn(main.app, adminWallet);
      await request(adminApp).get('/api/admin/me').set(bearer(token)).expect(200);

      const invite = (await request(adminApp).post('/api/admin/demo/invites').set(bearer(token)).send({ label: 'judge panel', maxSessions: 1 }).expect(200)).body.data;
      assert.match(invite.code, /^aw-/);
      const s = await start(invite.code);
      assert.equal(s.executionAllowed, true);
      await request(app).post('/api/demo/session').send({ inviteCode: invite.code }).expect(403);

      await request(adminApp).post('/api/admin/demo/execution').set(bearer(token)).send({ enabled: false }).expect(200);
      const p = await draftPayment(s);
      const off = await confirm(s, p).expect(503);
      assert.equal(off.body.error.code, 'DEMO_EXECUTION_DISABLED');
      await request(adminApp).post('/api/admin/demo/execution').set(bearer(token)).send({ enabled: true }).expect(200);

      const second = (await request(adminApp).post('/api/admin/demo/invites').set(bearer(token)).send({ label: 'revoked', maxSessions: 5 }).expect(200)).body.data;
      await request(adminApp).post(`/api/admin/demo/invites/${second.id}/revoke`).set(bearer(token)).expect(200);
      await request(app).post('/api/demo/session').send({ inviteCode: second.code }).expect(403);
      const listed = (await request(adminApp).get('/api/admin/demo').set(bearer(token)).expect(200)).body.data;
      assert.ok(!JSON.stringify(listed).includes(second.code), 'invite codes are never returned after creation');
    } finally {
      await main.container.close();
    }
  });

  test('startup fails closed when the chain does not match the server-held keys', async () => {
    const other = await deploySandbox(chain.provider, { owner, agent: devWallet(8), recipient });
    const db = await openDatabase({ pgliteDir: 'memory://' });
    try {
      const base = { nodeEnv: 'test', logLevel: 'silent', appOrigin: 'http://localhost:5173', corsOrigins: ['http://localhost:5173'], chainId: 31337,
        rpcUrl: chain.rpcUrl, databaseUrl: null, pgliteDir: 'memory://', migrationsDir: MIGRATIONS, publicAi: { dailyLimit: 30 },
        demo: demoSettings({ ...other, owner, agent }) };
      const rt = await createDemoRuntime(base, { db, llm: scriptedProvider([]), logger });
      assert.equal(rt.service, null);
      assert.match(rt.reason, /startup checks/);
    } finally {
      await db.close();
    }
  });
  test('durable relay gate and gas budget reject concurrent and excessive reservations atomically', async()=>{
    await budgetDb.query('DELETE FROM sandbox_relay_usage');
    const box=runtime.sandbox.container;
    const guard=createRelayGuard({db:budgetDb,settingsDb:box.db,demo:{...demoSettings({...sandbox,owner,agent}),maxGasPerTxWei:100n,sessionGasWei:150n,dailyGasWei:1000n}})({ ...box,repos:{...box.repos,executions:{findByProposal:async()=>({status:'FAILED'})}}},async()=> 'gas-test-session');
    const p={id:crypto.randomUUID(),token:{address:ETH},amountWei:'1'};
    await assert.rejects(guard.reserve(p,{maxCost:101n}),{code:'SANDBOX_GAS_LIMIT'});
    await guard.reserve(p,{maxCost:100n});
    await assert.rejects(guard.reserve({...p,id:crypto.randomUUID()},{maxCost:100n}),{code:'SANDBOX_RELAY_BUSY'});
    await guard.complete(p.id);
    await assert.rejects(guard.reserve({...p,id:crypto.randomUUID()},{maxCost:100n}),{code:'SANDBOX_RELAY_QUOTA'});
    const usage=(await budgetDb.query("SELECT * FROM sandbox_relay_usage WHERE subject='gas-test-session'")).rows[0];
    assert.equal(Number(usage.tx_count),1);
    assert.equal(String(usage.gas_wei),'100');
    assert.equal((await budgetDb.query('SELECT proposal_id FROM sandbox_relay_gate WHERE id=1')).rows[0].proposal_id,null,'failed quota rolls back the gate acquisition');
  });
  test('bounded grant confirmation, real grant execution, revocation and invite revocation', async()=>{
    await runtime.sandbox.container.executor.whenIdle();
    await runtime.sandbox.container.db.query('DELETE FROM demo_daily_usage');
    await budgetDb.query('DELETE FROM sandbox_relay_usage');
    const s=await start(INVITE);
    const t=(await request(app).post('/api/demo/sandbox/tasks').set(auth(s)).send({recipient:recipient.address,amount:'0.0001'}).expect(200)).body.data;
    assert.equal(t.maxRuns,2);
    await request(app).post('/api/demo/sandbox/tasks/'+t.id+'/confirm-grant').set(auth(s)).send({confirm:true,digest:'0x'+'00'.repeat(32)}).expect(400);
    await request(app).post('/api/demo/sandbox/tasks/'+t.id+'/confirm-grant').set(auth(s)).send({confirm:true,digest:t.grantDigest}).expect(200);
    await new Promise((r)=>setTimeout(r,5500));
    await request(app).post('/api/demo/sandbox/automation/run-due').set(auth(s)).send({}).expect(200);
    const live=await runtime.sandbox.container.chain.contract.grantRuns(t.grantDigest);
    assert.equal(live,1n,'a real local-chain grant transfer executed');
    await request(app).post('/api/demo/sandbox/tasks/'+t.id+'/revoke-demo').set(auth(s)).send({}).expect(200);
    assert.equal(await runtime.sandbox.container.chain.contract.grantRevoked(t.grantDigest),true);
    const invite=await runtime.service.createInvite({label:'revocation fixture',maxSessions:1},owner.address);
    const old=await start(invite.code);
    await runtime.service.revokeInvite(invite.id,owner.address);
    assert.equal((await runtime.service.authenticate('Bearer '+old.token)).executionAllowed,false);
    await assert.rejects(runtime.service.setLimits({dailyTxLimit:999},owner.address),{status:403});
  });
  test('personal SIWE ownership and database isolation; real owner-signed payment', async()=>{
    await budgetDb.query('DELETE FROM sandbox_relay_usage');
    const alice=devWallet(8),bob=devWallet(9),p=await deploySandbox(chain.provider,{owner:alice,agent,recipient});
    const fx=await deployFixture(chain.provider),main=await buildTestApp({rpcUrl:chain.rpcUrl,deployment:fx.deployment});
    const root={...main.container,db:budgetDb,config:{...main.container.config,demo:demoSettings({...sandbox,owner,agent}),publicAi:{dailyLimit:30}},demoRuntime:runtime,publicAiGate:{active:false}};
    const personal=express();personal.use(express.json());personal.use('/api/personal',createPersonalRouter(root,createRateLimits({disabled:true})));personal.use(createErrorHandler(logger));
    try{
      await budgetDb.query('INSERT INTO personal_sandboxes(owner_address,contract_address,approved_by,deploy_block) VALUES($1,$2,$3,0)',[alice.address,p.address,owner.address]);
      const at=await signIn(main.app,alice),bt=await signIn(main.app,bob);
      const prefix='/api/personal/'+p.address;
      await request(personal).get(prefix+'/config').expect(401);
      await request(personal).get(prefix+'/wallet/state').set(bearer(bt)).expect(403);
      const config=(await request(personal).get(prefix+'/config').set(bearer(at)).expect(200)).body.data;
      assert.equal(config.contractAddress,p.address);
      const proposed=(await request(personal).post(prefix+'/proposals').set(bearer(at)).send({token:ETH,recipient:recipient.address,amount:'0.0001',memo:'personal local test'}).expect(201)).body.data;
      const td=proposed.approvalTypedData,signature=await alice.signTypedData(td.domain,td.types,td.message);
      await request(personal).post(prefix+'/proposals/'+proposed.id+'/approve').set(bearer(at)).set('Idempotency-Key',crypto.randomUUID()).send({signature}).expect(200);
      let completed;
      for(let i=0;i<60;i++){completed=(await request(personal).get(prefix+'/proposals/'+proposed.id).set(bearer(at))).body.data;if(['CONFIRMED','FAILED'].includes(completed?.status))break;await new Promise((r)=>setTimeout(r,100));}
      assert.equal(completed.status,'CONFIRMED',completed.execution?.errorMessage);
      assert.equal(completed.approvedBy,alice.address);
      assert.ok(!(await runtime.sandbox.container.repos.proposals.list()).some((x)=>x.id===proposed.id),'personal row is absent from the shared demo schema');
    }finally{await root.close();}
  });
});
