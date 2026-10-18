import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { ethers } from 'ethers';
import { startTestChain, deployFixture } from './helpers/chain.js';
import { buildTestApp, signIn, signApproval, bearer, idemKey, waitFor } from './helpers/app.js';

describe('approval state machine and execution on a real local chain', () => {
  let chain, fx, ctx, ownerToken;

  before(async () => {
    chain = await startTestChain();
    fx = await deployFixture(chain.provider);
    ctx = await buildTestApp({ rpcUrl: chain.rpcUrl, deployment: fx.deployment });
    assert.equal(ctx.container.chain.status.ready, true, ctx.container.chain.status.error);
    ownerToken = await signIn(ctx.app, fx.owner);
  });

  after(async () => {
    await ctx?.container.close();
    await chain?.stop();
  });

  const createEth = (amount, recipient = fx.payeeA.address) =>
    request(ctx.app)
      .post('/api/proposals')
      .set(bearer(ownerToken))
      .send({ token: ethers.ZeroAddress, recipient, amount });

  const approve = (proposal, signature, key = idemKey()) =>
    request(ctx.app)
      .post(`/api/proposals/${proposal.id}/approve`)
      .set(bearer(ownerToken))
      .set('Idempotency-Key', key)
      .send({ signature });

  const getProposal = async (id) => (await request(ctx.app).get(`/api/proposals/${id}`).set(bearer(ownerToken)).expect(200)).body.data;

  test('approved ETH transfer is executed by the agent key and confirmed from the receipt', async () => {
    const before = await chain.provider.getBalance(fx.payeeA.address);
    const created = await createEth('0.005').expect(201);
    const proposal = created.body.data;
    assert.equal(proposal.status, 'AWAITING_APPROVAL', JSON.stringify(proposal.policyResult.violations));
    assert.equal(proposal.simulation.success, true);
    assert.ok(Number(proposal.simulation.gasEstimate) > 21000);
    assert.equal(proposal.amountWei, ethers.parseEther('0.005').toString());

    const sig = await signApproval(fx.owner, proposal);
    const res = await approve(proposal, sig).expect(200);
    assert.equal(res.body.data.status, 'APPROVED');

    const done = await waitFor(async () => {
      const p = await getProposal(proposal.id);
      return ['CONFIRMED', 'FAILED'].includes(p.status) ? p : null;
    });
    assert.equal(done.status, 'CONFIRMED', done.resolutionReason);
    assert.equal(done.execution.status, 'CONFIRMED');
    assert.match(done.execution.txHash, /^0x[0-9a-f]{64}$/);

    const receipt = await chain.provider.getTransactionReceipt(done.execution.txHash);
    assert.equal(receipt.status, 1);
    assert.equal(receipt.from, fx.agent.address, 'executed by the agent key, not the owner');
    assert.equal(receipt.to, fx.deployment.contractAddress);
    assert.equal((await chain.provider.getBalance(fx.payeeA.address)) - before, ethers.parseEther('0.005'));
    assert.equal(await fx.wallet.executedIntents(done.intentId), true);
  });

  test('ERC-20 transfer uses token decimals and token limits', async () => {
    const tokenAddress = fx.deployment.tokens[1].address;
    const before = await fx.token.balanceOf(fx.payeeA.address);
    const created = await request(ctx.app).post('/api/proposals').set(bearer(ownerToken))
      .send({ token: tokenAddress, recipient: fx.payeeA.address, amount: '12.5' }).expect(201);
    const proposal = created.body.data;
    assert.equal(proposal.amountWei, '12500000');
    await approve(proposal, await signApproval(fx.owner, proposal)).expect(200);
    const done = await waitFor(async () => {
      const p = await getProposal(proposal.id);
      return ['CONFIRMED', 'FAILED'].includes(p.status) ? p : null;
    });
    assert.equal(done.status, 'CONFIRMED', done.resolutionReason);
    assert.equal((await fx.token.balanceOf(fx.payeeA.address)) - before, 12_500_000n);
  });

  test('replaying the same Idempotency-Key returns the stored response without re-executing', async () => {
    const proposal = (await createEth('0.001').expect(201)).body.data;
    const sig = await signApproval(fx.owner, proposal);
    const key = idemKey();
    const first = await approve(proposal, sig, key).expect(200);
    const second = await approve(proposal, sig, key).expect(200);
    assert.equal(second.headers['idempotent-replayed'], 'true');
    assert.deepEqual(second.body, first.body);
    await waitFor(async () => (await getProposal(proposal.id)).status === 'CONFIRMED');
    const third = await approve(proposal, sig, idemKey()).expect(409);
    assert.equal(third.body.error.code, 'INVALID_STATE');
  });

  test('an Idempotency-Key reused for a different request is refused', async () => {
    const a = (await createEth('0.001').expect(201)).body.data;
    const b = (await createEth('0.001').expect(201)).body.data;
    const key = idemKey();
    await approve(a, await signApproval(fx.owner, a), key).expect(200);
    const res = await approve(b, await signApproval(fx.owner, b), key).expect(422);
    assert.equal(res.body.error.code, 'IDEMPOTENCY_KEY_REUSED');
    await request(ctx.app).post(`/api/proposals/${b.id}/reject`).set(bearer(ownerToken)).send({}).expect(200);
    await waitFor(async () => (await getProposal(a.id)).status === 'CONFIRMED');
  });

  test('concurrent approvals of one proposal produce exactly one execution', async () => {
    const proposal = (await createEth('0.001').expect(201)).body.data;
    const sig = await signApproval(fx.owner, proposal);
    const results = await Promise.all([approve(proposal, sig), approve(proposal, sig), approve(proposal, sig)]);
    const codes = results.map((r) => r.status).sort();
    assert.deepEqual(codes, [200, 409, 409]);
    const done = await waitFor(async () => {
      const p = await getProposal(proposal.id);
      return p.status === 'CONFIRMED' ? p : null;
    });
    const logs = await fx.wallet.queryFilter(fx.wallet.filters.TransferExecuted(done.intentId));
    assert.equal(logs.length, 1);
  });

  test('a signature over a different proposal cannot approve this one', async () => {
    const a = (await createEth('0.001').expect(201)).body.data;
    const b = (await createEth('0.001').expect(201)).body.data;
    const res = await approve(b, await signApproval(fx.owner, a)).expect(401);
    assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    assert.equal((await getProposal(b.id)).status, 'AWAITING_APPROVAL');
    for (const p of [a, b]) await request(ctx.app).post(`/api/proposals/${p.id}/reject`).set(bearer(ownerToken)).send({ reason: 'cleanup' }).expect(200);
  });

  test('rejected and policy-rejected proposals can never be approved', async () => {
    const p = (await createEth('0.001').expect(201)).body.data;
    const sig = await signApproval(fx.owner, p);
    await request(ctx.app).post(`/api/proposals/${p.id}/reject`).set(bearer(ownerToken)).send({ reason: 'no' }).expect(200);
    assert.equal((await approve(p, sig).expect(409)).body.error.code, 'INVALID_STATE');

    const bad = (await createEth('0.001', fx.payeeB.address).expect(201)).body.data;
    assert.equal(bad.status, 'POLICY_REJECTED');
    assert.ok(bad.policyResult.violations.some((v) => v.id === 'RECIPIENT_ALLOWLISTED'));
    assert.equal(bad.approvalTypedData, null);
  });

  test('policy rejects over-cap amounts and non-allowlisted recipients before anything is signed', async () => {
    const over = (await createEth('0.0101').expect(201)).body.data;
    assert.equal(over.status, 'POLICY_REJECTED');
    assert.ok(over.policyResult.violations.some((v) => v.id === 'PER_TX_LIMIT'));
    const outsider = (await createEth('0.001', fx.outsider.address).expect(201)).body.data;
    assert.equal(outsider.status, 'POLICY_REJECTED');
  });

  test('approval re-checks policy: a recipient removed from the allowlist after creation is refused', async () => {
    const additionReceipt = await (await fx.wallet.connect(fx.ownerSigner).setRecipient(fx.payeeB.address, true)).wait();
    const p = (await createEth('0.001', fx.payeeB.address).expect(201)).body.data;
    assert.ok(p.policyResult.snapshot.blockNumber >= additionReceipt.blockNumber, 'creation policy must see the mined allowlist change');
    assert.equal(p.status, 'AWAITING_APPROVAL', JSON.stringify(p.policyResult.violations));
    const removalReceipt = await (await fx.wallet.connect(fx.ownerSigner).setRecipient(fx.payeeB.address, false)).wait();
    const snapshot = await ctx.container.chain.getSnapshot();
    assert.ok(snapshot.blockNumber >= removalReceipt.blockNumber, 'policy snapshot must see the mined allowlist change');
    const res = await approve(p, await signApproval(fx.owner, p)).expect(422);
    assert.equal(res.body.error.code, 'POLICY_FAILED_AT_APPROVAL');
    assert.equal((await getProposal(p.id)).status, 'POLICY_REJECTED');
  });

  test('daily-limit reservations stop concurrent approvals from over-committing', async () => {
    // Remaining ETH today = 0.05 - already spent. Fill up to just below the cap with pending proposals.
    const state = (await request(ctx.app).get('/api/wallet/state').set(bearer(ownerToken)).expect(200)).body.data;
    const eth = state.tokens.find((t) => t.native);
    const remaining = BigInt(eth.remainingToday);
    const chunk = ethers.parseEther('0.01');
    const count = Number(remaining / chunk);
    const created = [];
    for (let i = 0; i < count + 1; i++) created.push((await createEth('0.01').expect(201)).body.data);
    // All pass at creation (reservations only count approved/in-flight), but approval must stop at the cap.
    // Keep approved reservations pending while testing approval contention.
    // Otherwise background attempts can safely fail TREASURY_BUSY and release
    // capacity before the last approval, invalidating the assumed fixed capacity.
    await ctx.container.executor.whenIdle();
    ctx.container.proposals.setExecutor(null);
    let outcomes;
    try {
      outcomes = await Promise.all(created.map(async p => {
        if (p.status !== 'AWAITING_APPROVAL') return p.status;
        const r = await approve(p, await signApproval(fx.owner, p));
        return r.status === 200 ? 'APPROVED' : r.body.error.code;
      }));
      assert.equal(outcomes.filter(o => o === 'APPROVED').length, count, `remaining=${remaining} outcomes=${outcomes}`);
      assert.ok(outcomes.includes('POLICY_FAILED_AT_APPROVAL') || outcomes.includes('POLICY_REJECTED'));
    } finally { ctx.container.proposals.setExecutor(ctx.container.executor); }
    // Now settle each authorized payment and check actual on-chain spend.
    for (let i=0;i<created.length;i++) if (outcomes[i]==='APPROVED') {
      await ctx.container.executor.enqueue(created[i].id);
      assert.equal((await getProposal(created[i].id)).status,'CONFIRMED');
    }
    const after = (await request(ctx.app).get('/api/wallet/state').set(bearer(ownerToken)).expect(200)).body.data;
    const spent = BigInt(after.tokens.find((t) => t.native).spentToday);
    assert.equal(spent, BigInt(eth.spentToday) + BigInt(count) * chunk);
    assert.ok(spent <= ethers.parseEther('0.05'));
  });

  test('expired proposals cannot be approved', async () => {
    const tokenAddress = fx.deployment.tokens[1].address;
    const p = (await request(ctx.app).post('/api/proposals').set(bearer(ownerToken))
      .send({ token: tokenAddress, recipient: fx.payeeA.address, amount: '1' }).expect(201)).body.data;
    assert.equal(p.status, 'AWAITING_APPROVAL');
    // Force expiry in the database (TTL is 180s); approval must refuse with 410.
    await ctx.container.db.query(`UPDATE proposals SET expires_at = now() - interval '1 second' WHERE id = $1`, [p.id]);
    const res = await approve(p, await signApproval(fx.owner, p)).expect(410);
    assert.equal(res.body.error.code, 'PROPOSAL_EXPIRED');
    assert.equal((await getProposal(p.id)).status, 'EXPIRED');
  });

  test('transaction history only shows receipt-verified data and the audit chain verifies', async () => {
    await ctx.container.indexer.syncOnce();
    const history = (await request(ctx.app).get('/api/transactions').set(bearer(ownerToken)).expect(200)).body.data;
    const executed = history.filter((h) => h.events.some((e) => e.name === 'TransferExecuted'));
    assert.ok(executed.length >= 3);
    for (const h of executed) assert.equal(h.status, 'CONFIRMED');
    const audit = (await request(ctx.app).get('/api/audit/verify').set(bearer(ownerToken)).expect(200)).body.data;
    assert.equal(audit.valid, true);
    assert.ok(audit.entries > 10);
  });
});
