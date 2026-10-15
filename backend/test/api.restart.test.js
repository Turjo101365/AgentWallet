import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { ethers } from 'ethers';
import { startTestChain, deployFixture } from './helpers/chain.js';
import { buildTestApp, signIn, signApproval, bearer, idemKey, waitFor, tempDir } from './helpers/app.js';

describe('restart safety', () => {
  let chain, fx;
  before(async () => {
    chain = await startTestChain();
    fx = await deployFixture(chain.provider);
  });
  after(async () => chain?.stop());

  test('an approval interrupted before execution is executed exactly once after restart', async () => {
    const dir = tempDir('aw-restart-');
    const first = await buildTestApp({ rpcUrl: chain.rpcUrl, deployment: fx.deployment, env: { PGLITE_DIR: dir } });
    const token = await signIn(first.app, fx.owner);
    const p = (await request(first.app).post('/api/proposals').set(bearer(token)).send({ token: ethers.ZeroAddress, recipient: fx.payeeA.address, amount: '0.002' }).expect(201)).body.data;
    // Simulate a crash between approval and execution: detach the executor so approve only records state.
    first.container.proposals.setExecutor(null);
    await request(first.app).post(`/api/proposals/${p.id}/approve`).set(bearer(token)).set('Idempotency-Key', idemKey()).send({ signature: await signApproval(fx.owner, p) }).expect(200);
    await first.container.close();

    const balanceBefore = await chain.provider.getBalance(fx.payeeA.address);
    const second = await buildTestApp({ rpcUrl: chain.rpcUrl, deployment: fx.deployment, env: { PGLITE_DIR: dir } });
    // The old session is still valid after restart (sessions are persisted).
    await request(second.app).get('/api/auth/session').set(bearer(token)).expect(200);
    const recovered = await second.container.executor.recover();
    assert.equal(recovered.resumed, 1);
    const done = await waitFor(async () => {
      const r = (await request(second.app).get(`/api/proposals/${p.id}`).set(bearer(token))).body.data;
      return ['CONFIRMED', 'FAILED'].includes(r.status) ? r : null;
    });
    assert.equal(done.status, 'CONFIRMED', done.resolutionReason);
    assert.equal((await chain.provider.getBalance(fx.payeeA.address)) - balanceBefore, ethers.parseEther('0.002'));

    // A second recovery pass must not execute again.
    assert.equal((await second.container.executor.recover()).resumed, 0);
    await second.container.close();
  });
});
