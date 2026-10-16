#!/usr/bin/env node
/**
 * Independent, read-only verification of the AgentWallet audit hash chain.
 *
 *   node submission/tools/verify-audit-chain.mjs [pglite-dir]      (default: a temp COPY of backend/data/sepolia)
 *
 * It never opens the original database: it copies the directory first, then reads audit_log from the copy.
 * The hashing is re-implemented here (it does not import the backend): for every row
 *   hash = SHA-256( prev_hash || canonical([occurred_at, actor, action, entity_type, entity_id, details]) )
 * with key-sorted JSON, starting from 64 zeros. Any edited, removed or reordered row breaks the chain.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(ROOT, 'backend', 'package.json'));
const { PGlite } = await import(pathToFileURL(require.resolve('@electric-sql/pglite')).href);

const source = path.resolve(process.argv[2] || path.join(ROOT, 'backend', 'data', 'sepolia'));
const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-audit-verify-'));
fs.cpSync(source, copy, { recursive: true });
const c = { dim: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', x: '\x1b[0m' };

const stable = (v) =>
  Array.isArray(v) ? `[${v.map(stable).join(',')}]`
    : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
      : JSON.stringify(v ?? null);
// Only values stored under a key named like "txHash" are transaction hashes (intent ids and grant digests are not).
const findTxHash = (v) => {
  if (!v || typeof v !== 'object') return null;
  for (const [k, x] of Object.entries(v)) {
    if (/txhash/i.test(k) && typeof x === 'string' && /^0x[0-9a-f]{64}$/i.test(x)) return x;
    const inner = findTxHash(x);
    if (inner) return inner;
  }
  return null;
};
const iso = (t) => (t instanceof Date ? t : new Date(t)).toISOString();

console.log(`${c.b}AgentWallet audit-chain verification (independent re-implementation, read-only)${c.x}`);
console.log(`${c.dim}source  ${path.relative(ROOT, source) || source}  (copied to a temp dir; original untouched)${c.x}`);
const db = new PGlite(copy);
const { rows } = await db.query('SELECT id, occurred_at, actor, action, entity_type, entity_id, details, prev_hash, hash FROM audit_log ORDER BY id ASC');
let prev = '0'.repeat(64);
let ok = true;
const txs = [];
for (const r of rows) {
  const input = stable([iso(r.occurred_at), r.actor, r.action, r.entity_type, r.entity_id ?? null, r.details]);
  const h = crypto.createHash('sha256').update(prev + input).digest('hex');
  const good = r.prev_hash === prev && h === r.hash;
  ok &&= good;
  const tx = findTxHash(r.details);
  if (tx) txs.push([r.id, r.action, tx]);
  const actor = String(r.actor).startsWith('0x') ? `${r.actor.slice(0, 6)}…${r.actor.slice(-4)}` : r.actor;
  console.log(`${good ? `${c.g}✓` : `${c.r}✗`}${c.x} #${String(r.id).padStart(2)}  ${iso(r.occurred_at).slice(11, 19)}  ${r.action.padEnd(34)} ${actor.padEnd(12)} ${c.dim}${r.hash.slice(0, 16)}…${c.x}${tx ? `  ${c.y}tx ${tx.slice(0, 10)}…${c.x}` : ''}`);
  if (!good) break;
  prev = r.hash;
}
await db.close();
fs.rmSync(copy, { recursive: true, force: true });
console.log('');
console.log(ok ? `${c.g}${c.b}CHAIN VALID${c.x}  ${rows.length} entries · head ${prev}` : `${c.r}${c.b}CHAIN BROKEN${c.x}`);
if (txs.length) {
  console.log(`${c.dim}entries that record an on-chain transaction hash (details.txHash):${c.x}`);
  for (const [id, action, tx] of txs) console.log(`  #${id} ${action} → ${tx}`);
}
process.exit(ok ? 0 : 1);
