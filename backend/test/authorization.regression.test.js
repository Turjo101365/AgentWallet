import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { ethers } from 'ethers';
import { startTestChain, deployFixture, v1Artifact } from './helpers/chain.js';
import { buildTestApp, signIn, signApproval, bearer, idemKey, waitFor } from './helpers/app.js';

/**
 * Regression tests for audit findings F1 (signed deadline not enforced at execution) and F3 (approval and
 * grant signatures not re-verified against the exact fields executed). Each case reaches the executor
 * through the real API and scheduler, then tampers with state the way a crash, a stale queue, a database
 * edit or an ownership change would. Nothing may be signed or broadcast afterwards.
 */
const ETH = ethers.ZeroAddress;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);

// Runs against the current build (v2: the contract verifies the owner's signature too) and against the frozen v1
// bytecode deployed on Ethereum Sepolia (the contract trusts the agent key, so these backend checks are the guard).
for (const [version, walletArtifact, method] of [[2, undefined, 'executeApprovedTransfer'], [1, v1Artifact(), 'executeTransfer']]) describe(`authorization is re-verified at execution time (F1, F3), contract v${version}`, () => {
  let chain, fx, ctx, token;

  before(async () => {
    chain = await startTestChain();
    fx = await deployFixture(chain.provider, { walletArtifact });
    await (await fx.wallet.setRecipient(fx.payeeB.address, true)).wait();
    ctx = await buildTestApp({ rpcUrl: chain.rpcUrl, deployment: fx.deployment, env: { PROPOSAL_TTL_SECONDS: '30', TASK_LEASE_SECONDS: '5' } });
    token = await signIn(ctx.app, fx.owner);
    assert.equal(ctx.container.chain.contractVersion(), version, 'backend detected the deployed contract version');
  });
  after(async () => {
    await ctx?.container.close();
    await chain?.stop();
  });

  const db = (sql, params) => ctx.container.db.query(sql, params);
  const getProposal = async (id) => (await request(ctx.app).get(`/api/proposals/${id}`).set(bearer(token)).expect(200)).body.data;
  const agentNonce = () => chain.provider.getTransactionCount(fx.agent.address, 'latest');
  const detachExecutor = () => ctx.container.proposals.setExecutor(null);
  const attachExecutor = () => ctx.container.proposals.setExecutor(ctx.container.executor);

  async function create(amount = '0.001', recipient = fx.payeeA.address) {
    const res = await request(ctx.app).post('/api/proposals').set(bearer(token)).send({ token: ETH, recipient, amount }).expect(201);
    assert.equal(res.body.data.status, 'AWAITING_APPROVAL', JSON.stringify(res.body.data.policyResult?.violations));
    return res.body.data;
  }

  /** Owner approves through the API while the executor is down, so the proposal sits APPROVED. */
  async function approveWhileExecutorDown(proposal) {
    detachExecutor();
    const res = await request(ctx.app).post(`/api/proposals/${proposal.id}/approve`).set(bearer(token)).set('Idempotency-Key', idemKey())
      .send({ signature: await signApproval(fx.owner, proposal) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.status, 'APPROVED');
  }

  /** Restart recovery, then wait for a terminal state. */
  async function recoverAndSettle(id) {
    attachExecutor();
    await ctx.container.executor.recover();
    await ctx.container.executor.whenIdle();
    return waitFor(async () => {
      const p = await getProposal(id);
      return ['CONFIRMED', 'FAILED'].includes(p.status) ? p : null;
    });
  }

  test('control: an untampered approval still executes after recovery', async () => {
    const p = await create();
    await approveWhileExecutorDown(p);
    const done = await recoverAndSettle(p.id);
    assert.equal(done.status, 'CONFIRMED', done.resolutionReason);
    const tx = await chain.provider.getTransaction(done.execution.txHash);
    assert.equal(ctx.container.chain.executionContract().interface.parseTransaction({ data: tx.data }).name, method);
  });

  test('F1: an approval whose signed deadline passed while the executor was down is never executed', async () => {
    const p = await create();
    const deadline = Number(p.approvalTypedData.message.deadline);
    assert.equal(deadline, p.expiresAt, 'the signed deadline is the proposal expiry');
    await approveWhileExecutorDown(p);
    const nonce = await agentNonce();
    const before = await chain.provider.getBalance(fx.payeeA.address);
    await sleep((deadline - now() + 2) * 1000);
    const done = await recoverAndSettle(p.id);
    assert.equal(done.status, 'FAILED');
    assert.equal(done.execution.errorCode, 'APPROVAL_EXPIRED');
    assert.equal(done.execution.txHash, null, 'nothing was signed');
    assert.equal(await agentNonce(), nonce, 'the agent sent no transaction');
    assert.equal(await chain.provider.getBalance(fx.payeeA.address), before);
  });

  test('F1: an approval with too little time left before the signed deadline is refused, not extended', async () => {
    const p = await create();
    await db(`UPDATE proposals SET expires_at = now() + interval '5 seconds' WHERE id = $1`, [p.id]);
    const fresh = await getProposal(p.id); // typed data now carries the near deadline the owner would see
    const res = await request(ctx.app).post(`/api/proposals/${p.id}/approve`).set(bearer(token)).set('Idempotency-Key', idemKey())
      .send({ signature: await signApproval(fx.owner, fresh) });
    assert.equal(res.status, 410);
    assert.equal(res.body.error.code, 'APPROVAL_TOO_LATE');
    assert.equal((await getProposal(p.id)).status, 'AWAITING_APPROVAL');
  });

  for (const [label, sql, param] of [
    ['amount', `UPDATE proposals SET amount_wei = $2 WHERE id = $1`, () => ethers.parseEther('0.009').toString()],
    ['recipient (another allowlisted address)', `UPDATE proposals SET recipient = $2 WHERE id = $1`, () => fx.payeeB.address],
  ]) {
    test(`F3: an approved proposal whose ${label} was edited in the database is not executed`, async () => {
      const p = await create();
      await approveWhileExecutorDown(p);
      await db(sql, [p.id, param()]);
      const nonce = await agentNonce();
      const done = await recoverAndSettle(p.id);
      assert.equal(done.status, 'FAILED');
      assert.equal(done.execution.errorCode, 'APPROVAL_SIGNATURE_INVALID');
      assert.equal(await agentNonce(), nonce, 'the agent sent no transaction');
    });
  }

  test('F3: a stored approval signature swapped for a non-owner signature over the same proposal is refused', async () => {
    const p = await create();
    await approveWhileExecutorDown(p);
    const forged = await signApproval(fx.outsider, p);
    await db(`UPDATE proposals SET approval_signature = $2, approved_by = $3 WHERE id = $1`, [p.id, forged, fx.outsider.address]);
    const nonce = await agentNonce();
    const done = await recoverAndSettle(p.id);
    assert.equal(done.status, 'FAILED');
    assert.equal(done.execution.errorCode, 'APPROVER_NOT_OWNER');
    assert.equal(await agentNonce(), nonce);
  });

  // ------------------------------------------------------------------ task grants

  async function allowAuto(wei) {
    await request(ctx.app).put('/api/policy').set(bearer(token)).send({ autoApprovalMaxPerTx: { [ETH]: wei.toString() }, confirmLoosening: true }).expect(200);
  }
  async function authorizedTask(body = {}) {
    const res = await request(ctx.app).post('/api/tasks').set(bearer(token)).send({
      token: ETH, recipient: fx.payeeA.address, amount: '0.001', validUntil: now() + 3600, schedule: { type: 'once', at: now() + 1 }, ...body,
    }).expect(201);
    const task = res.body.data;
    const { domain, types, message } = task.grantTypedData;
    await request(ctx.app).post(`/api/tasks/${task.id}/authorize`).set(bearer(token)).send({ signature: await fx.owner.signTypedData(domain, types, message) }).expect(200);
    return task;
  }
  const getTask = async (id) => (await request(ctx.app).get(`/api/tasks/${id}`).set(bearer(token)).expect(200)).body.data;
  async function pump(rounds = 3) {
    for (let i = 0; i < rounds; i++) {
      await ctx.container.scheduler.tick();
      await ctx.container.executor.whenIdle();
      await sleep(250);
    }
  }

  test('control: an untampered grant run executes autonomously through the grant entry point', async () => {
    await allowAuto(ethers.parseEther('0.005'));
    const task = await authorizedTask({ schedule: { type: 'once', at: now() + 1 } });
    await sleep(1200);
    await pump();
    const t = await getTask(task.id);
    assert.equal(t.runs[0].status, 'CONFIRMED', JSON.stringify(t.runs[0]));
    const p = await getProposal(t.runs[0].proposalId);
    const tx = await chain.provider.getTransaction(p.execution.txHash);
    assert.equal(ctx.container.chain.executionContract().interface.parseTransaction({ data: tx.data }).name, version === 2 ? 'executeGrantTransfer' : 'executeTransfer');
    if (version === 2) {
      const receipt = await chain.provider.getTransactionReceipt(p.execution.txHash);
      const names = receipt.logs.map((l) => { try { return ctx.container.chain.contract.interface.parseLog(l)?.name; } catch { return null; } });
      assert.ok(names.includes('GrantRunExecuted'), 'the contract counted the run against the signed grant');
    }
  });

  test('F3: a task whose recipient is edited in the database after the owner signed is not auto-approved', async () => {
    await allowAuto(ethers.parseEther('0.005'));
    const task = await authorizedTask({ schedule: { type: 'once', at: now() + 2 } });
    await db(`UPDATE tasks SET recipient = $2 WHERE id = $1`, [task.id, fx.payeeB.address]);
    const before = await chain.provider.getBalance(fx.payeeB.address);
    await sleep(2200);
    await pump();
    const t = await getTask(task.id);
    assert.equal(t.runs.length, 1);
    assert.notEqual(t.runs[0].decision?.outcome, 'AUTO_APPROVED', JSON.stringify(t.runs[0].decision));
    assert.equal(t.runs[0].status, 'ESCALATED');
    assert.ok(t.runs[0].decision.approvalRoute.reasons.some((r) => /signature does not verify/.test(r)));
    assert.equal(await chain.provider.getBalance(fx.payeeB.address), before, 'nothing was paid to the substituted recipient');
    const audit = (await request(ctx.app).get('/api/audit').set(bearer(token))).body.data;
    assert.ok(audit.some((a) => a.action === 'TASK_GRANT_INVALID' && a.entityId === task.id));
  });

  /** Grant-approves a run while the executor is down, so its proposal sits APPROVED (TASK_GRANT). */
  async function grantApprovedRunWhileExecutorDown(body = {}) {
    await allowAuto(ethers.parseEther('0.005'));
    detachExecutor();
    const task = await authorizedTask({ schedule: { type: 'once', at: now() + 1 }, ...body });
    await sleep(1200);
    await pump(2);
    const t = await getTask(task.id);
    const proposal = await getProposal(t.runs[0].proposalId);
    assert.equal(proposal.status, 'APPROVED', JSON.stringify(proposal.policyResult?.violations));
    assert.equal(proposal.approvalKind, 'TASK_GRANT');
    return { task, proposal };
  }

  test('F3: a grant-approved proposal whose amount was edited before execution is not executed', async () => {
    const { proposal } = await grantApprovedRunWhileExecutorDown();
    await db(`UPDATE proposals SET amount_wei = $2 WHERE id = $1`, [proposal.id, ethers.parseEther('0.004').toString()]);
    const nonce = await agentNonce();
    const done = await recoverAndSettle(proposal.id);
    assert.equal(done.status, 'FAILED');
    assert.equal(done.execution.errorCode, 'GRANT_SIGNATURE_INVALID');
    assert.equal(await agentNonce(), nonce);
  });

  test('F3: a grant-approved run is not executed after its task is cancelled', async () => {
    const { task, proposal } = await grantApprovedRunWhileExecutorDown();
    await request(ctx.app).post(`/api/tasks/${task.id}/cancel`).set(bearer(token)).send({ reason: 'owner changed mind' }).expect(200);
    const nonce = await agentNonce();
    const done = await recoverAndSettle(proposal.id);
    assert.equal(done.status, 'FAILED');
    assert.equal(done.execution.errorCode, 'GRANT_REVOKED');
    assert.equal(await agentNonce(), nonce);
  });

  test('F1: a grant-approved run is not executed after the signed grant expired', async () => {
    // The grant must still be valid ON-CHAIN when the run is approved (v2 checks validUntil in the approval-time
    // simulation). Hardhat runs eth_call in a pending block whose timestamp drifts ahead of the wall clock as a long
    // test file mines blocks (measured 6+ s here), so leave a wide margin; a grant near expiry fails closed on-chain.
    const chainNow = Number((await chain.provider.getBlock('latest')).timestamp);
    const validUntil = Math.max(now(), chainNow) + 30;
    const { proposal } = await grantApprovedRunWhileExecutorDown({ validUntil });
    await sleep((validUntil - now() + 2) * 1000);
    const nonce = await agentNonce();
    const done = await recoverAndSettle(proposal.id);
    assert.equal(done.status, 'FAILED');
    assert.equal(done.execution.errorCode, 'GRANT_EXPIRED');
    assert.equal(await agentNonce(), nonce);
  });

  // Runs last: it hands the contract to another owner.
  test('an approval signed by the previous owner is not executed after an ownership change', async () => {
    const p = await create();
    await approveWhileExecutorDown(p);
    await (await fx.wallet.transferOwnership(fx.payeeB.address)).wait();
    await (await fx.wallet.connect(fx.payeeB).acceptOwnership()).wait();
    const nonce = await agentNonce();
    const done = await recoverAndSettle(p.id);
    assert.equal(done.status, 'FAILED');
    assert.equal(done.execution.errorCode, 'APPROVER_NOT_OWNER');
    assert.equal(await agentNonce(), nonce);
  });
});
