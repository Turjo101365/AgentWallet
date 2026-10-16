#!/usr/bin/env node
/**
 * Builds submission/06-execution-evidence/EXECUTION_EVIDENCE.md from data only:
 * receipts-verified.json (independent RPC check), evidence/sepolia/{evidence.json,timeline.json,explorer/verification.json}
 * and the audit-chain log. No hash is typed by hand.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'submission', '06-execution-evidence');
const rc = JSON.parse(fs.readFileSync(path.join(OUT, 'receipts-verified.json'), 'utf8'));
const verification = JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence', 'sepolia', 'explorer', 'verification.json'), 'utf8'));
const timeline = JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence', 'sepolia', 'timeline.json'), 'utf8'));
const auditLog = fs.readFileSync(path.join(ROOT, 'evidence', 'submission', 'footage', 'term-audit.log'), 'utf8');

// What authorized each transaction, which AI decision (if any) produced it, and where it is shown.
const META = {
  'top-up deployer': { highlight: false, auth: 'Owner key, run script (gas for the deployer)', ai: '—', clip: '07-contract-deployment (run log)', audit: '— (before the backend started)', step: 'deploy' },
  'top-up agent': { highlight: false, auth: 'Owner key, run script (gas for the agent key)', ai: '—', clip: '07-contract-deployment (run log)', audit: '—', step: 'deploy' },
  deploy: { highlight: 'Contract deployment', auth: 'Deployer key; `CONFIRM_PUBLIC_DEPLOY=yes` + `--i-approve-sepolia-transactions`', ai: '—', clip: '07-contract-deployment', audit: '—', step: 'deploy' },
  'owner setRecipient': { highlight: false, auth: 'Owner wallet transaction (console, test bridge)', ai: '—', clip: '15-end-to-end (context); raw run 161–186 s', audit: '#3 RECIPIENT_LABEL_SET (label only)', step: 'allowlist' },
  'owner deposit': { highlight: false, auth: 'Owner wallet transaction (console, test bridge)', ai: '—', clip: 'raw run 186–198 s', audit: '—', step: 'deposit' },
  'owner-approved transfer (AI-drafted)': { highlight: 'Owner-approved AI transaction', auth: 'Owner EIP-712 `ApproveTransfer` signature (test bridge, programmatic)', ai: 'gpt-4.1-mini: list_recipients → record_plan → propose_transfer (proposal 2556bd41); 14/14 policy checks passed', clip: '02-ai-command, 05-owner-approval, 08-public-verification', audit: '#4 PROPOSAL_CREATED, #5 AGENT_TURN, #6 PROPOSAL_APPROVED, #7 EXECUTION_SUBMITTED, #8–#9 EXECUTION_CONFIRMED', step: 'approve' },
  'autonomous transfer (AI-drafted task, grant-approved)': { highlight: 'Autonomous AI transaction', auth: 'Owner-signed EIP-712 `AuthorizeTask` grant (once); the run was auto-approved by the grant within the 0.0001 ETH auto-approval limit; no per-transfer signature (`approval_kind = TASK_GRANT`)', ai: 'gpt-4.1-mini: record_plan → list_recipients → schedule_payment (task aa334b60)', clip: '06-autonomous-execution, 08-public-verification, 14-innovation, 15-end-to-end', audit: '#13 TASK_CREATED, #14 AGENT_TURN, #15 TASK_AUTHORIZED, #16 TASK_RUN_CREATED, #17 PROPOSAL_CREATED, #18 PROPOSAL_APPROVED_BY_GRANT, #19 TASK_RUN_AUTO_APPROVED, #20 EXECUTION_SUBMITTED, #21 EXECUTION_CONFIRMED, #22 TASK_RUN_CONFIRMED', step: 'grant' },
  'owner pause': { highlight: 'Pause', auth: 'Owner wallet transaction', ai: '—', clip: '09-emergency-controls', audit: '— (on-chain only)', step: 'controls' },
  'owner unpause': { highlight: 'Unpause', auth: 'Owner wallet transaction', ai: '—', clip: '09-emergency-controls', audit: '— (on-chain only)', step: 'controls' },
  'owner emergencyStop': { highlight: 'Emergency stop', auth: 'Owner wallet transaction', ai: '—', clip: '09-emergency-controls, 14-innovation', audit: '— (on-chain only)', step: 'controls' },
  'owner withdraw': { highlight: 'Withdraw', auth: 'Owner wallet transaction', ai: '—', clip: 'raw run 543–553 s', audit: '— (on-chain only)', step: 'withdraw' },
};

const short = (h) => `${h.slice(0, 10)}…${h.slice(-6)}`;
const lines = [];
lines.push('# Execution evidence (Deliverable 06)');
lines.push('');
lines.push(`Ethereum Sepolia (chain 11155111), a public testnet. Contract [\`${rc.contract}\`](https://sepolia.etherscan.io/address/${rc.contract}). Run on 2026-10-16, about 10:04–10:13 UTC, authorized by the team owner.`);
lines.push('');
lines.push(`**Independent receipt verification:** \`node submission/tools/verify-receipts.mjs\` read every transaction, receipt and block from \`${new URL(rc.rpc).host}\` at ${rc.verifiedAt.replace('T', ' ').slice(0, 19)} UTC. Result: **${rc.transactions.filter((t) => t.status === 'SUCCESS').length}/${rc.transactions.length} SUCCESS**. Raw data: \`receipts-verified.json\`; recording: \`evidence/submission/footage/term-receipts.webm\`.`);
lines.push('');
lines.push(`**Explorer confirmation:** Blockscout, recorded after the run at ${verification.recordedAt.replace('T', ' ').slice(0, 19)} UTC. All pages confirmed: ${verification.allConfirmed}. Screenshots are in \`evidence/sepolia/explorer/\`; video in \`evidence/sepolia/recordings/raw/explorer-verification.webm\`.`);
lines.push('');
lines.push(`**Contract state now** (read-only): paused = ${rc.contractStateNow.paused}, agent = \`${rc.contractStateNow.agent}\` (revoked by the emergency stop), owner \`${rc.contractStateNow.owner.split(' ').pop()}\`.`);
lines.push('');
lines.push('**Roles:**');
lines.push('- owner `0x10A0d3247a1446fD30ba40D14e4272206278b5ba`');
lines.push('- agent `0x30D53BD30B6D60E7c49829D6Df79b5B7E4CBBD1D`');
lines.push('- deployer `0x80D4101A23062ee7E5B2477D4C036AB0FD4e2a67`');
lines.push('- recipient `0x82446B165d0d55051af76e3aD7852B0F3141904e`');
lines.push('');
lines.push('All four are distinct, testnet-only keys.');
lines.push('');
lines.push('## Highlights');
lines.push('');
lines.push('| | Tx | Block | Status | Explorer |');
lines.push('|---|---|---|---|---|');
for (const t of rc.transactions) {
  const m = META[t.label];
  if (m?.highlight) lines.push(`| **${m.highlight}** | \`${short(t.hash)}\` | ${t.blockNumber} | ${t.status} | [Etherscan](${t.etherscan}) · [Blockscout](${t.blockscout}) |`);
}
lines.push('');
lines.push('## All 11 transactions');
lines.push('');
for (const t of rc.transactions) {
  const m = META[t.label] || {};
  const v = verification.items.find((i) => i.id.toLowerCase() === t.hash.toLowerCase());
  lines.push(`### ${t.n}. ${t.label}`);
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|---|---|');
  lines.push(`| Transaction hash | \`${t.hash}\` |`);
  lines.push(`| Explorer | [Etherscan](${t.etherscan}) · [Blockscout](${t.blockscout}) |`);
  lines.push(`| Block · time | ${t.blockNumber} · ${t.timestampUtc.replace('T', ' ').slice(0, 19)} UTC |`);
  lines.push(`| Status | **${t.status}** (receipt), Blockscout: ${v ? v.explorerShows : 'n/a'} |`);
  lines.push(`| From → to | ${t.fromRole} \`${t.from}\` → ${t.contractCreated ? `contract creation → \`${t.contractCreated}\`` : `${t.toRole} \`${t.to}\``}${Number(t.valueEth) ? ` · ${t.valueEth} ETH` : ''} |`);
  lines.push(`| Method | \`${t.method}\` · gas used ${t.gasUsed} |`);
  lines.push(`| Events | ${t.events.length ? t.events.map((e) => `\`${e.name}\`${e.args && Object.keys(e.args).length ? ` (${Object.entries(e.args).map(([k, x]) => `${k}=${String(x).length > 20 ? `${String(x).slice(0, 10)}…` : x}`).join(', ')})` : ''}`).join('; ') : '— (plain ETH transfer)'} |`);
  lines.push(`| Authorization | ${m.auth || '—'} |`);
  lines.push(`| AI decision | ${m.ai || '—'} |`);
  lines.push(`| Audit log | ${m.audit || '—'} |`);
  lines.push(`| Video | ${m.clip || '—'}; raw run step \`${m.step}\` (\`timeline.json\`)${v ? `; explorer verification ${v.start.toFixed(1)}–${v.end.toFixed(1)} s` : ''} |`);
  lines.push(`| Screenshot | ${v ? `\`evidence/sepolia/${v.screenshot}\`` : '—'} |`);
  lines.push('');
}
lines.push('## Off-chain evidence from the same run');
lines.push('');
lines.push('- **Policy rejection, no transaction:** an AI-drafted 0.0003 ETH transfer failed `PER_TX_LIMIT` and `BALANCE_AND_RESERVE`. It was never signed or broadcast, so there is deliberately **no hash**.');
lines.push('  - Proof: audit #10 `PROPOSAL_POLICY_REJECTED` has no `txHash`.');
lines.push('  - The agent key sent exactly 2 transactions (nonce check in `RUN_NOTES.md`), both listed above.');
lines.push('  - Clip `04-rejected-transaction`.');
lines.push('- **Audit hash chain:** 22 entries, valid, head below. Recomputed independently on a copy of the run database:');
lines.push('');
lines.push('```');
lines.push(auditLog.split('\n').filter((l) => /CHAIN VALID|#\d+ EXECUTION/.test(l)).join('\n').trim());
lines.push('```');
lines.push('');
lines.push('## Files (originals unchanged; SHA-256 in `evidence/sepolia/MANIFEST.json`)');
lines.push('');
lines.push('| File | What |');
lines.push('|---|---|');
lines.push('| `evidence/sepolia/EVIDENCE.md`, `evidence.json` | Receipts, classification, AI-agent logs (generated by `scripts/collect-evidence.mjs`) |');
lines.push('| `evidence/sepolia/timeline.json`, `run-log.txt`, `RUN_NOTES.md` | Step times, the run log, honest limitations |');
lines.push('| `evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm` | Unedited 10 min 29 s screen recording of the whole run (git-ignored, upload separately) |');
lines.push('| `evidence/sepolia/recordings/raw/explorer-verification.webm`, `explorer/` | Post-run read-only explorer verification |');
lines.push('| `receipts-verified.json` (this folder) | Today\'s independent receipt re-verification |');
lines.push('');
lines.push('**Limitations:**');
lines.push('- The public run signed with a test-only EIP-1193 bridge, not the MetaMask extension. Real MetaMask was tested on a local chain only (clip 12).');
lines.push('- Live explorer clips in the raw recording show "Pending" and third-party ads; the post-run verification replaces them.');
lines.push('- Etherscan blocks automated browsers, so the recordings use Blockscout.');
fs.writeFileSync(path.join(OUT, 'EXECUTION_EVIDENCE.md'), lines.join('\n') + '\n');
console.log(`wrote ${path.relative(ROOT, path.join(OUT, 'EXECUTION_EVIDENCE.md'))}`);
