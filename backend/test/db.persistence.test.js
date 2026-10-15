import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { createRepositories } from '../src/repositories/index.js';
import { tempDir } from './helpers/app.js';

const MIGRATIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database/migrations');

async function open(dir) {
  const db = await openDatabase({ pgliteDir: dir });
  await migrate(db, MIGRATIONS);
  return { db, repos: createRepositories(db) };
}

function sampleProposal(overrides = {}) {
  const id = crypto.randomUUID();
  return {
    id,
    intentId: '0x' + crypto.randomBytes(32).toString('hex'),
    source: 'MANUAL',
    createdBy: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    chainId: 31337,
    contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    token: { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', decimals: 18 },
    recipient: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    amountWei: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
    status: 'AWAITING_APPROVAL',
    policyResult: { passed: true, violations: [], checks: [] },
    expiresAt: Math.floor(Date.now() / 1000) + 180,
    ...overrides,
  };
}

describe('database persistence (PGlite, real PostgreSQL engine)', () => {
  test('migrations are idempotent and state survives a restart', async () => {
    const dir = tempDir('aw-db-');
    let { db, repos } = await open(dir);
    const p = await repos.proposals.insert(sampleProposal());
    await repos.settings.set('agent.paused', { paused: true }, 'tester');
    await db.close();

    ({ db, repos } = await open(dir));
    const again = await migrate(db, MIGRATIONS);
    assert.deepEqual(again.applied, []);
    const loaded = await repos.proposals.findById(p.id);
    assert.equal(loaded.status, 'AWAITING_APPROVAL');
    assert.equal(loaded.amountWei, sampleProposal().amountWei, 'uint256 max round-trips exactly');
    assert.equal(loaded.token.symbol, 'ETH');
    assert.equal(typeof loaded.expiresAt, 'number', 'timestamps map to unix seconds (camelCase domain shape)');
    assert.deepEqual(await repos.settings.get('agent.paused'), { paused: true });
    await db.close();
  });

  test('status transitions are compare-and-set: only one concurrent approval wins', async () => {
    const { db, repos } = await open('memory://');
    const p = await repos.proposals.insert(sampleProposal());
    const results = await Promise.all(
      Array.from({ length: 8 }, () => repos.proposals.transition(p.id, ['AWAITING_APPROVAL'], 'APPROVED', { approvedBy: 'x', approvedAt: 1 })),
    );
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await repos.proposals.findById(p.id)).status, 'APPROVED');
    assert.equal(await repos.proposals.transition(p.id, ['AWAITING_APPROVAL'], 'REJECTED'), null);
    await db.close();
  });

  test('expired proposals cannot transition when expiry is required, and the sweep expires them', async () => {
    const { db, repos } = await open('memory://');
    const p = await repos.proposals.insert(sampleProposal({ expiresAt: Math.floor(Date.now() / 1000) - 5 }));
    assert.equal(await repos.proposals.transition(p.id, ['AWAITING_APPROVAL'], 'APPROVED', {}, { requireUnexpired: true }), null);
    const expired = await repos.proposals.expireStale();
    assert.deepEqual(expired.map((e) => e.id), [p.id]);
    assert.equal((await repos.proposals.findById(p.id)).status, 'EXPIRED');
    await db.close();
  });

  test('database constraints reject invalid statuses, zero amounts and duplicate executions', async () => {
    const { db, repos } = await open('memory://');
    await assert.rejects(repos.proposals.insert(sampleProposal({ status: 'DONE' })));
    await assert.rejects(repos.proposals.insert(sampleProposal({ amountWei: '0' })));
    const p = await repos.proposals.insert(sampleProposal());
    const first = await repos.executions.create({ proposalId: p.id, intentId: p.intentId, executorAddress: '0xabc' });
    const second = await repos.executions.create({ proposalId: p.id, intentId: p.intentId, executorAddress: '0xabc' });
    assert.ok(first);
    assert.equal(second, null, 'a proposal can only ever have one execution');
    await db.close();
  });

  test('idempotency keys: new, replay, mismatch and in-progress', async () => {
    const { db, repos } = await open('memory://');
    assert.equal((await repos.idempotency.begin('k1', 'approve:a', 'h1')).state, 'new');
    assert.equal((await repos.idempotency.begin('k1', 'approve:a', 'h1')).state, 'in_progress');
    await repos.idempotency.complete('k1', 200, { ok: true });
    const replay = await repos.idempotency.begin('k1', 'approve:a', 'h1');
    assert.equal(replay.state, 'replay');
    assert.deepEqual(replay.response, { ok: true });
    assert.equal((await repos.idempotency.begin('k1', 'approve:a', 'h2')).state, 'mismatch');
    assert.equal((await repos.idempotency.begin('k1', 'approve:b', 'h1')).state, 'mismatch');
    await db.close();
  });

  test('sessions and nonces: single-use nonce, revocation', async () => {
    const { db, repos } = await open('memory://');
    await repos.auth.createNonce({ nonce: 'n1', address: '0xA', message: 'm', expiresAt: Math.floor(Date.now() / 1000) + 60 });
    assert.ok(await repos.auth.consumeNonce('n1'));
    assert.equal(await repos.auth.consumeNonce('n1'), null);
    await repos.auth.createNonce({ nonce: 'n2', address: '0xA', message: 'm', expiresAt: Math.floor(Date.now() / 1000) - 1 });
    assert.equal(await repos.auth.consumeNonce('n2'), null, 'expired nonce');
    const s = await repos.auth.createSession({ tokenHash: 'h', address: '0xA', expiresAt: Math.floor(Date.now() / 1000) + 60 });
    assert.ok(await repos.auth.findActiveSession('h'));
    await repos.auth.revokeSession(s.id);
    assert.equal(await repos.auth.findActiveSession('h'), null);
    await db.close();
  });

  test('audit log is append-only and its hash chain detects tampering', async () => {
    const { db, repos } = await open('memory://');
    for (let i = 0; i < 5; i++) await repos.audit.append({ actor: 'a', action: `ACT_${i}`, entityType: 't', entityId: i, details: { n: i, nested: { z: 1, a: [1, 2] } } });
    assert.deepEqual((await repos.audit.verify()).valid, true);
    await assert.rejects(db.query('UPDATE audit_log SET actor = $1', ['mallory']), /append-only/);
    await assert.rejects(db.query('DELETE FROM audit_log'), /append-only/);

    // Simulate a privileged attacker who bypasses the trigger: the hash chain must still expose it.
    await db.exec('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_mutation');
    await db.query(`UPDATE audit_log SET details = '{"n": 99}' WHERE action = 'ACT_2'`);
    const result = await repos.audit.verify();
    assert.equal(result.valid, false);
    assert.equal(result.brokenAt, 3);
    await db.close();
  });
});
