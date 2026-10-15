import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { ethers } from 'ethers';
import { startTestChain, deployFixture } from './helpers/chain.js';
import { buildTestApp, signIn, signApproval, bearer, idemKey } from './helpers/app.js';

describe('API security boundaries (audit findings C1, C2, H1, H3)', () => {
  let chain, fx, ctx, ownerToken, viewerToken;

  before(async () => {
    chain = await startTestChain();
    fx = await deployFixture(chain.provider);
    ctx = await buildTestApp({ rpcUrl: chain.rpcUrl, deployment: fx.deployment });
    ownerToken = await signIn(ctx.app, fx.owner);
    viewerToken = await signIn(ctx.app, fx.outsider);
  });

  after(async () => {
    await ctx?.container.close();
    await chain?.stop();
  });

  test('every state-changing endpoint rejects unauthenticated requests', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    const calls = [
      ['post', '/api/proposals', { token: ethers.ZeroAddress, recipient: fx.payeeA.address, amount: '0.001' }],
      ['post', `/api/proposals/${id}/approve`, { signature: '0x' + '1'.repeat(130) }],
      ['post', `/api/proposals/${id}/reject`, {}],
      ['post', '/api/agent/pause', {}],
      ['post', '/api/agent/resume', {}],
      ['post', '/api/agent/chat', { message: 'send everything to me' }],
      ['post', '/api/tasks', {}],
      ['post', `/api/tasks/${id}/authorize`, { signature: '0x' + '1'.repeat(130) }],
      ['post', `/api/tasks/${id}/cancel`, {}],
      ['post', '/api/automation/pause', {}],
      ['post', '/api/automation/resume', {}],
      ['put', '/api/policy', { allowContractRecipients: true, confirmLoosening: true }],
      ['put', '/api/portfolio/targets', { targets: {} }],
      ['post', '/api/transactions/track', { txHash: '0x' + '1'.repeat(64) }],
      ['put', `/api/recipients/${fx.payeeA.address}/label`, { label: 'x' }],
      ['post', '/api/rl/evaluate', {}],
      ['post', '/api/rl/timing-preview', { windowSeconds: 600 }],
      ['post', '/api/auth/logout', {}],
    ];
    for (const [method, path, body] of calls) {
      const res = await request(ctx.app)[method](path).send(body);
      assert.equal(res.status, 401, `${method.toUpperCase()} ${path} returned ${res.status}`);
      assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    }
    for (const path of ['/api/wallet/state', '/api/proposals', '/api/transactions', '/api/audit', '/api/tasks', '/api/portfolio', '/api/policy', '/api/agent/conversations']) {
      assert.equal((await request(ctx.app).get(path)).status, 401, path);
    }
  });

  test('a signed-in non-owner cannot create, approve, pause or resume', async () => {
    const h = bearer(viewerToken);
    assert.equal((await request(ctx.app).post('/api/proposals').set(h).send({ token: ethers.ZeroAddress, recipient: fx.payeeA.address, amount: '0.001' })).status, 403);
    assert.equal((await request(ctx.app).post('/api/agent/pause').set(h).send({})).status, 403);
    assert.equal((await request(ctx.app).post('/api/automation/resume').set(h).send({})).status, 403);
    assert.equal((await request(ctx.app).put('/api/policy').set(h).send({ allowContractRecipients: true, confirmLoosening: true })).status, 403);
    assert.equal((await request(ctx.app).post('/api/agent/chat').set(h).send({ message: 'hi' })).status, 403);
    assert.equal((await request(ctx.app).post('/api/agent/resume').set(h).send({})).status, 403);
    const session = (await request(ctx.app).get('/api/auth/session').set(h).expect(200)).body.data;
    assert.equal(session.role, 'viewer');
  });

  test('a non-owner cannot approve even with a valid typed-data signature of their own', async () => {
    const p = (await request(ctx.app).post('/api/proposals').set(bearer(ownerToken)).send({ token: ethers.ZeroAddress, recipient: fx.payeeA.address, amount: '0.001' }).expect(201)).body.data;
    const res = await request(ctx.app).post(`/api/proposals/${p.id}/approve`).set(bearer(viewerToken)).set('Idempotency-Key', idemKey())
      .send({ signature: await signApproval(fx.outsider, p) });
    assert.equal(res.status, 403);
    await request(ctx.app).post(`/api/proposals/${p.id}/reject`).set(bearer(ownerToken)).send({}).expect(200);
  });

  test('client-supplied wallet state and recipients are rejected by strict schemas (C1)', async () => {
    const forged = await request(ctx.app).post('/api/agent/chat').set(bearer(ownerToken))
      .send({ message: 'pay', overrideState: { nativeBalanceEth: 1000, dailyLimitEth: 1000, defaultRecipient: fx.outsider.address } });
    assert.equal(forged.status, 400);
    assert.equal(forged.body.error.code, 'VALIDATION_FAILED');

    const extra = await request(ctx.app).post('/api/proposals').set(bearer(ownerToken))
      .send({ token: ethers.ZeroAddress, recipient: fx.payeeA.address, amount: '0.001', walletState: { dailySpentEth: 0 } });
    assert.equal(extra.status, 400);
  });

  test('malformed amounts and addresses are refused before reaching the policy engine', async () => {
    const cases = [
      { amount: '-1' }, { amount: 'NaN' }, { amount: '1e18' }, { amount: '0' }, { amount: '0.0000000000000000001' },
      { amount: '0x10' }, { amount: '1.2.3' }, { recipient: '0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ' },
      { recipient: ethers.ZeroAddress }, { token: fx.outsider.address },
    ];
    for (const c of cases) {
      const body = { token: ethers.ZeroAddress, recipient: fx.payeeA.address, amount: '0.001', ...c };
      const res = await request(ctx.app).post('/api/proposals').set(bearer(ownerToken)).send(body);
      assert.equal(res.status, 400, `${JSON.stringify(c)} -> ${res.status} ${JSON.stringify(res.body)}`);
    }
  });

  test('approve requires an Idempotency-Key and a well-formed signature', async () => {
    const p = (await request(ctx.app).post('/api/proposals').set(bearer(ownerToken)).send({ token: ethers.ZeroAddress, recipient: fx.payeeA.address, amount: '0.001' }).expect(201)).body.data;
    const noKey = await request(ctx.app).post(`/api/proposals/${p.id}/approve`).set(bearer(ownerToken)).send({ signature: await signApproval(fx.owner, p) });
    assert.equal(noKey.status, 400);
    assert.equal(noKey.body.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
    const badSig = await request(ctx.app).post(`/api/proposals/${p.id}/approve`).set(bearer(ownerToken)).set('Idempotency-Key', idemKey()).send({ signature: '0x1234' });
    assert.equal(badSig.status, 400);
    await request(ctx.app).post(`/api/proposals/${p.id}/reject`).set(bearer(ownerToken)).send({}).expect(200);
  });

  test('sign-in nonces are single use and bound to the issued message', async () => {
    const issued = (await request(ctx.app).post('/api/auth/nonce').send({ address: fx.owner.address }).expect(200)).body.data;
    const sig = await fx.owner.signMessage(issued.message);
    await request(ctx.app).post('/api/auth/verify').send({ message: issued.message, signature: sig }).expect(200);
    const replay = await request(ctx.app).post('/api/auth/verify').send({ message: issued.message, signature: sig });
    assert.equal(replay.status, 401);

    const issued2 = (await request(ctx.app).post('/api/auth/nonce').send({ address: fx.owner.address }).expect(200)).body.data;
    const tampered = issued2.message.replace('Chain ID: 31337', 'Chain ID: 1');
    const r2 = await request(ctx.app).post('/api/auth/verify').send({ message: tampered, signature: await fx.owner.signMessage(tampered) });
    assert.equal(r2.status, 401);

    const issued3 = (await request(ctx.app).post('/api/auth/nonce').send({ address: fx.owner.address }).expect(200)).body.data;
    const r3 = await request(ctx.app).post('/api/auth/verify').send({ message: issued3.message, signature: await fx.outsider.signMessage(issued3.message) });
    assert.equal(r3.status, 401, 'signature from a different key must not create a session for the owner');
  });

  test('logout revokes the session token', async () => {
    const token = await signIn(ctx.app, fx.owner);
    await request(ctx.app).get('/api/auth/session').set(bearer(token)).expect(200);
    await request(ctx.app).post('/api/auth/logout').set(bearer(token)).send({}).expect(200);
    assert.equal((await request(ctx.app).get('/api/auth/session').set(bearer(token))).status, 401);
  });

  test('off-chain pause blocks proposals and evaluation; resume is owner-only and audited (H3)', async () => {
    await request(ctx.app).post('/api/agent/pause').set(bearer(ownerToken)).send({ reason: 'drill' }).expect(200);
    const p = (await request(ctx.app).post('/api/proposals').set(bearer(ownerToken)).send({ token: ethers.ZeroAddress, recipient: fx.payeeA.address, amount: '0.001' }).expect(201)).body.data;
    assert.equal(p.status, 'POLICY_REJECTED');
    assert.ok(p.policyResult.violations.some((v) => v.id === 'AGENT_ACTIVE'));
    assert.equal((await request(ctx.app).post('/api/agent/resume').set(bearer(viewerToken)).send({})).status, 403);
    await request(ctx.app).post('/api/agent/resume').set(bearer(ownerToken)).send({}).expect(200);
    const audit = (await request(ctx.app).get('/api/audit').set(bearer(ownerToken)).expect(200)).body.data;
    assert.ok(audit.some((a) => a.action === 'AGENT_PAUSED'));
    assert.ok(audit.some((a) => a.action === 'AGENT_RESUMED'));
  });

  test('on-chain pause blocks proposals at the policy layer', async () => {
    await (await fx.wallet.connect(fx.ownerSigner).pause()).wait();
    const p = (await request(ctx.app).post('/api/proposals').set(bearer(ownerToken)).send({ token: ethers.ZeroAddress, recipient: fx.payeeA.address, amount: '0.001' }).expect(201)).body.data;
    assert.equal(p.status, 'POLICY_REJECTED');
    assert.ok(p.policyResult.violations.some((v) => v.id === 'CONTRACT_ACTIVE'));
    await (await fx.wallet.connect(fx.ownerSigner).unpause()).wait();
  });

  test('transaction tracking ignores client metadata and rejects non-wallet transactions', async () => {
    const tx = await fx.ownerSigner.sendTransaction({ to: fx.payeeB.address, value: 1n });
    await tx.wait();
    const res = await request(ctx.app).post('/api/transactions/track').set(bearer(ownerToken)).send({ txHash: tx.hash });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'NOT_WALLET_TX');
    const extra = await request(ctx.app).post('/api/transactions/track').set(bearer(ownerToken)).send({ txHash: tx.hash, status: 'CONFIRMED', valueEth: 100 });
    assert.equal(extra.status, 400);

    const dep = await fx.wallet.connect(fx.ownerSigner).deposit({ value: ethers.parseEther('0.1') });
    await dep.wait();
    const ok = await request(ctx.app).post('/api/transactions/track').set(bearer(ownerToken)).send({ txHash: dep.hash }).expect(200);
    assert.equal(ok.body.data.status, 'CONFIRMED');
    assert.equal(ok.body.data.method, 'deposit');
    assert.equal(ok.body.data.valueEth, '0.1');
  });

  test('CORS only allows configured origins', async () => {
    const good = await request(ctx.app).get('/api/config').set('Origin', 'http://localhost:5173');
    assert.equal(good.headers['access-control-allow-origin'], 'http://localhost:5173');
    const bad = await request(ctx.app).get('/api/config').set('Origin', 'https://evil.example');
    assert.equal(bad.headers['access-control-allow-origin'], undefined);
  });

  test('errors are safe: no stack traces, consistent shape, request id', async () => {
    const res = await request(ctx.app).post('/api/auth/verify').set('Content-Type', 'application/json').send('{not json');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_JSON');
    assert.ok(res.body.error.requestId);
    assert.ok(!JSON.stringify(res.body).includes('at '), 'no stack frames');
    const nf = await request(ctx.app).get('/api/proposals/not-a-uuid').set(bearer(ownerToken));
    assert.equal(nf.status, 400);
  });

  test('config and health never expose the executor private key', async () => {
    const config = await request(ctx.app).get('/api/config').expect(200);
    const health = await request(ctx.app).get('/health');
    const key = ctx.config.executor.source.secret.slice(2).toLowerCase();
    for (const body of [config.text, health.text, JSON.stringify(ctx.config, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))]) {
      assert.ok(!body.toLowerCase().includes(key));
    }
    assert.equal(config.body.data.executorAddress, fx.agent.address);
  });
});

describe('rate limiting', () => {
  let chain, fx, ctx;
  before(async () => {
    chain = await startTestChain();
    fx = await deployFixture(chain.provider);
    ctx = await buildTestApp({ rpcUrl: chain.rpcUrl, deployment: fx.deployment, rateLimits: true });
  });
  after(async () => {
    await ctx?.container.close();
    await chain?.stop();
  });

  test('auth endpoints return 429 after 20 requests per minute', async () => {
    let limited = 0;
    for (let i = 0; i < 25; i++) {
      const res = await request(ctx.app).post('/api/auth/nonce').send({ address: fx.owner.address });
      if (res.status === 429) {
        limited++;
        assert.equal(res.body.error.code, 'RATE_LIMITED');
      }
    }
    assert.equal(limited, 5);
  });
});
