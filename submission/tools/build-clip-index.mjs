#!/usr/bin/env node
/**
 * Writes evidence/submission/mini-clips/CLIP_INDEX.md from clips.resolved.json (the exact segments rendered) and
 * ffprobe of each MP4. Also writes evidence/submission/MANIFEST.json (SHA-256 of every file under
 * evidence/submission/ and submission/, excluding the clip tooling's node-free sources).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'evidence', 'submission', 'mini-clips');
const FFPROBE = 'D:/my-video/node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe';
const resolved = JSON.parse(fs.readFileSync(path.join(DIR, 'clips.resolved.json'), 'utf8'));

const META = {
  '01-dashboard': { cls: 'Public-run data, post-run read-only replay', model: 'n/a. The replay has no LLM connected, so the AI badge shows "Model unavailable"; the stored turns name gpt-4.1-mini', hashes: 'UI list of all public transactions (explorer chips)', logs: 'evidence/submission/footage/replay-log.json', limits: 'Replay of a COPY of the run database after the run, with the executor disabled. Balances are live from the chain; the contract is paused now.' },
  '02-ai-command': { cls: 'Public (original run recording) + post-run replay', model: 'gpt-4.1-mini (openai-compatible), real API calls during the public run, 4 model calls', hashes: 'leads to 0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb', logs: 'evidence/sepolia/EVIDENCE.md (AI agent execution log)', limits: 'The original recording shows the earlier console UI; the replay shows the same stored turn in the redesigned UI.' },
  '03-risk-engine': { cls: 'Public-run data, post-run replay', model: '—', hashes: 'policy evaluation at block 11926666 / 11926670', logs: 'proposal policyResult in the run database; audit #4, #10', limits: 'Shows the stored results of the evaluations that ran during the public run; not a re-evaluation.' },
  '04-rejected-transaction': { cls: 'Public (original) + post-run replay + live verification of the public-run audit chain', model: 'gpt-4.1-mini', hashes: 'none: the transfer was never broadcast (by design)', logs: 'audit #10 PROPOSAL_POLICY_REJECTED (term-audit.log); RUN_NOTES.md nonce check', limits: 'There is no on-chain rejection transaction; the rejection happened off-chain before signing.' },
  '05-owner-approval': { cls: 'Public (original run) + post-run replay + post-run explorer verification', model: 'gpt-4.1-mini drafted the transfer', hashes: '0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb (block 11926668)', logs: 'audit #6–#9', limits: 'Signed programmatically by the test-only EIP-1193 bridge, NOT MetaMask (see clip 12 for MetaMask, local).' },
  '05-owner-approval-v2': { cls: 'Public original run recording (owner signed by the test-only EIP-1193 bridge) + live read-only verification of the public-run data + post-run explorer verification; final segment is a SEPARATE LOCAL Hardhat run with the real MetaMask extension', model: 'gpt-4.1-mini drafted the proposal (public run)', hashes: '0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb (block 11926668). The local MetaMask segment is a different proposal on a local chain, not public', logs: 'Authorization evidence: EIP-712 ApproveTransfer, domain "AgentWallet Operator Approval" v1, chainId 11155111, verifyingContract 0x8A44716E…F956a6; recovered signer 0x10A0d3247a1446fD30ba40D14e4272206278b5ba = contract owner(); signature stored in proposals.approval_signature and in audit entry #6 PROPOSAL_APPROVED; verified by submission/tools/verify-owner-approval.mjs (term-owner-approval.log); code: backend/src/lib/approval.js, services/proposalService.js approve()', limits: 'The owner signature is verified OFF-CHAIN by the backend (recoverApprover + signer == owner()); the contract does not check it, it only enforces agent-only execution, allowlist, caps and one-time intents. Public signing was programmatic (test-only bridge), not MetaMask; the MetaMask segment is local and a different proposal. The ~40 s wait between approval and receipt is cut.' },
  '13-system-architecture-v2': { cls: 'Explanatory architecture diagram, screen-recorded in a browser (not execution evidence)', model: 'diagram shows gpt-4.1-mini as an external, untrusted planner', hashes: 'contract 0x8A44716Efabb6Ce401291B91D4427149CaF956a6 (label only)', logs: 'Architecture source: submission/01-technical-documentation/architecture-v2.svg (editable) and .png; verified against frontend/src, backend/src/{routes/api.js, services/agentChatService.js, llm/tools.js, services/riskEngine.js, services/proposalService.js, services/schedulerService.js, services/executorService.js, repositories/index.js}, contracts/src/AgentWallet.sol', limits: 'Illustration only. RL timing is shown as optional and local-only (opt-in per task, may only defer; use_rl_timing was false in the public run). No terminal or test footage; the v1 clip keeps the e2e test run if needed as testing evidence.' },
  '06-autonomous-execution': { cls: 'Public (original run) + post-run replay + post-run explorer + live audit verification', model: 'gpt-4.1-mini drafted the task', hashes: '0xedeb6b97380d3b0615639ca0940402789310f16154501ea54990418d48e3cec3 (block 11926686)', logs: 'audit #13–#22; EVIDENCE.md (approval_kind TASK_GRANT)', limits: 'The ~2.5 min wait between grant and execution is cut. The grant signature used the test-only bridge.' },
  '07-contract-deployment': { cls: 'Public (original run log page) + post-run explorer verification', model: '—', hashes: 'deploy 0x7d7492bfd7414f25b8f7a9a06200d3f1e958433b6d349443313108fa10ae1ad3; contract 0x8A44716Efabb6Ce401291B91D4427149CaF956a6', logs: 'evidence/sepolia/run-log.txt', limits: 'The live explorer clip from the run showed "Pending" and ads, so the post-run verification (10:22 UTC) is used instead. The deploy itself was run by the script (run-log page), not a UI.' },
  '08-public-verification': { cls: 'Post-run explorer verification + live read-only receipt check', model: '—', hashes: 'all 11 (receipts terminal); explorer: 0x2c83a855…, 0xedeb6b97…', logs: 'submission/06-execution-evidence/receipts-verified.json; term-receipts.log', limits: 'Blockscout, not Etherscan (Etherscan blocks automation). Recorded after the run; labelled as such.' },
  '09-emergency-controls': { cls: 'Public (original run) + post-run explorer verification', model: '—', hashes: 'pause 0x2a2eeb50…bd211b; unpause 0x00b0dc31…f2f3d0; emergencyStop 0xfe627133…e53a8d', logs: 'run-log.txt; receipts-verified.json', limits: 'The earlier console UI (original recording). Waits for confirmation are trimmed.' },
  '10-permission-security': { cls: 'Public-run data replay (viewer and owner) + LOCAL test runs', model: '—', hashes: '—', logs: 'term-security-tests.log, term-contract-tests.log', limits: 'Viewer and owner sessions are post-run replays; the test runs are local Hardhat.' },
  '11-audit-monitoring': { cls: 'Public-run data replay + live independent verification of the public-run audit chain', model: 'gpt-4.1-mini (stored turn)', hashes: '0x2c83a855…, 0xedeb6b97… (correlated from audit entries)', logs: 'term-audit.log', limits: 'The replay\'s own sign-ins add entries after #22 (shown as 23+); the independent check verifies the original 22 from an untouched copy.' },
  '12-metamask-local': { cls: 'LOCAL HARDHAT TESTING with the real MetaMask 13.52.0 extension', model: '— (row 9, the AI-drafted approval, was BLOCKED: it needs a paid LLM call, not made)', hashes: 'local chain only (not public)', logs: 'evidence/submission/footage/metamask/checklist-report.md', limits: 'The public Sepolia run did NOT use MetaMask. Local chain only.' },
  '13-system-architecture': { cls: 'Explanatory diagram + LOCAL e2e test run + public-data replay (health)', model: '—', hashes: '—', logs: 'term-e2e.log', limits: 'The diagram is an illustration, not evidence. In the replay the executor is deliberately disabled and the RL service is not running.' },
  '14-innovation': { cls: 'Mixed, each segment labelled (public original, replay, explorer, live verification)', model: 'gpt-4.1-mini', hashes: '0xedeb6b97…e3cec3; 0xfe627133…e53a8d', logs: 'term-audit.log', limits: 'Treasury rebalancing is NOT shown: it is a proposal, not implemented.' },
  '15-end-to-end': { cls: 'Public (original run) + replay + post-run explorer + live verification', model: 'gpt-4.1-mini', hashes: '0xedeb6b97380d3b0615639ca0940402789310f16154501ea54990418d48e3cec3', logs: 'audit #13–#22; receipts-verified.json', limits: 'Condensed: about 2.5 min of scheduler wait is cut between steps 3 and 5.' },
};

function probe(file) {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,pix_fmt:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout || '{}');
  const s = j.streams?.[0] || {};
  const [n, d] = String(s.r_frame_rate || '0/1').split('/').map(Number);
  return { duration: Number(j.format?.duration || 0), width: s.width, height: s.height, fps: d ? n / d : 0, codec: s.codec_name, pix: s.pix_fmt };
}

const out = ['# Mini-clip index', '', 'Every clip is cut from genuine footage. Overlays (labels, captions, highlight boxes, subtle zooms) only point at real UI. Source files are preserved unchanged, and their SHA-256 hashes are in `evidence/sepolia/MANIFEST.json` and `evidence/submission/MANIFEST.json`. Rendered with `node submission/tools/clips/render.mjs` from `submission/tools/clips/spec.mjs`.', '', '`handles/` holds the same source ranges with 3 s of extra footage on each side and no overlays, for your own edit.', ''];
out.push('| Clip | Duration | Resolution | Classification | Criterion |', '|---|---|---|---|---|');
const rows = [];
for (const c of resolved.clips) {
  const f = path.join(DIR, `${c.id}.mp4`);
  const p = fs.existsSync(f) ? probe(f) : null;
  rows.push({ c, p });
  out.push(`| \`${c.id}.mp4\` | ${p ? `${p.duration.toFixed(1)} s` : '**MISSING**'} | ${p ? `${p.width}×${p.height} · ${Math.round(p.fps)} fps · ${p.codec}` : '—'} | ${META[c.id]?.cls || ''} | ${c.criterion || ''} |`);
}
out.push('');
for (const { c, p } of rows) {
  const m = META[c.id] || {};
  out.push(`## ${c.id}.mp4: ${c.title}`, '');
  out.push(`- **Duration / format:** ${p ? `${p.duration.toFixed(2)} s · ${p.width}×${p.height} · ${p.fps.toFixed(2)} fps · ${p.codec} (${p.pix}) · no audio` : 'MISSING'}`);
  out.push(`- **Classification:** ${m.cls}`);
  out.push(`- **AI model:** ${m.model || '—'}`);
  out.push(`- **Transaction hashes:** ${m.hashes || '—'}`);
  out.push(`- **Supporting logs:** ${m.logs || '—'}`);
  out.push(`- **Evidence limitations:** ${m.limits || '—'}${c.note ? ` ${c.note}` : ''}`);
  out.push(`- **Supports:** ${c.criterion || '—'}`);
  out.push('', '| # | Source file | Source range | Wall clock / run | Label | Caption |', '|---|---|---|---|---|---|');
  c.segments.forEach((s, i) => out.push(`| ${i + 1} | \`${s.sourceFile}\` | ${s.from.toFixed(1)}–${s.to.toFixed(1)} s | ${s.stamp || '—'} | ${s.kind} | ${s.caption || ''} |`));
  out.push('');
}
fs.writeFileSync(path.join(DIR, 'CLIP_INDEX.md'), out.join('\n') + '\n');

// SHA-256 manifest of the submission package.
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
const files = [...walk(path.join(ROOT, 'evidence', 'submission')), ...walk(path.join(ROOT, 'submission'))].filter((p) => !p.endsWith('MANIFEST.json') && !p.includes(`${path.sep}node_modules${path.sep}`));
const manifest = { generatedAt: new Date().toISOString(), algorithm: 'sha256', files: Object.fromEntries(files.map((p) => [path.relative(ROOT, p).split(path.sep).join('/'), { bytes: fs.statSync(p).size, sha256: sha(p) }])) };
fs.writeFileSync(path.join(ROOT, 'evidence', 'submission', 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
console.log(`CLIP_INDEX.md: ${rows.filter((r) => r.p).length}/${rows.length} clips present; MANIFEST.json: ${files.length} files`);
