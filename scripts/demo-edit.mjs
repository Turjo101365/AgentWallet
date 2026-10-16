#!/usr/bin/env node
/**
 * Builds the concise demo video from the GENUINE raw recording. The raw file is never modified.
 *
 *   node scripts/demo-edit.mjs <evidence dir>      # e.g. evidence/sepolia
 *
 * Reads <dir>/timeline.json (step start/end seconds written by scripts/sepolia-demo.mjs) and
 * <dir>/recordings/raw/*.webm. Output: <dir>/recordings/agentwallet-demo.mp4: intro card, then per step a
 * title card plus the matching footage (long waits trimmed to their start and end, never reordered or
 * altered), then an outro card listing the transaction hashes. Title cards are rendered by headless
 * Chromium; cutting and encoding use ffmpeg (AW_FFMPEG, or the ffmpeg bundled with Remotion in D:\my-video).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(ROOT, 'frontend', 'package.json'))('@playwright/test');
const FFMPEG = process.env.AW_FFMPEG || 'D:/my-video/node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe';
const W = 1440, H = 900, FPS = 25;

/** Builds <dir>/recordings/agentwallet-demo.mp4 and returns its path. */
export async function buildDemo(dir) {
  const timeline = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
  const raw = path.join(dir, timeline.video);
  const work = path.join(dir, 'recordings', '_work');
  fs.mkdirSync(work, { recursive: true });
  if (!fs.existsSync(FFMPEG)) throw new Error(`ffmpeg not found at ${FFMPEG}; set AW_FFMPEG`);

  function ff(args) {
    const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.slice(-400)}`);
  }
  const enc = ['-an', '-vf', `scale=${W}:${H},format=yuv420p`, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22'];
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const chainName = { 11155111: 'Ethereum Sepolia public testnet (chain 11155111)', 84532: 'Base Sepolia public testnet (chain 84532)', 31337: 'Local Hardhat chain (REHEARSAL, nothing public)' }[timeline.chainId] || `chain ${timeline.chainId}`;

  async function cards(list) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    for (const c of list) {
      await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;justify-content:center;padding:0 110px;box-sizing:border-box;background:linear-gradient(135deg,#0f172a,#064e3b);color:#f8fafc;font-family:Segoe UI,system-ui,sans-serif">
        <div style="font-size:22px;letter-spacing:.14em;text-transform:uppercase;color:#6ee7b7">${esc(c.kicker)}</div>
        <div style="font-size:56px;font-weight:700;line-height:1.15;margin:18px 0 26px">${esc(c.title)}</div>
        ${c.rows ? `<table style="border-collapse:collapse;font-size:16px;color:#e2e8f0">${c.rows.map(([a, b]) => `<tr><td style="padding:4px 22px 4px 0;color:#94a3b8;white-space:nowrap">${esc(a)}</td><td style="padding:4px 0;font-family:Consolas,monospace">${esc(b)}</td></tr>`).join('')}</table><div style="font-size:18px;color:#cbd5e1;margin-top:18px">${esc(c.body || '')}</div>`
        : `<div style="font-size:24px;line-height:1.55;color:#cbd5e1;white-space:pre-wrap">${esc(c.body || '')}</div>`}
        <div style="position:absolute;bottom:30px;left:110px;font-size:18px;color:#94a3b8">${esc(chainName)} · genuine footage, trimmed for length · wallet: test-only EIP-1193 bridge (not MetaMask)</div></body>`);
      await page.screenshot({ path: c.png });
    }
    await browser.close();
  }

  const pieces = [];
  const cardList = [];
  const addCard = (name, kicker, title, body, seconds, rows = null) => {
    const png = path.join(work, `${name}.png`);
    cardList.push({ png, kicker, title, body, rows });
    pieces.push({ type: 'card', png, seconds, out: path.join(work, `${name}.mp4`) });
  };

  addCard('00-intro', timeline.rehearsal ? 'Recording rehearsal · NOT public evidence' : 'AgentWallet · FinTechathon demo', timeline.rehearsal ? 'Rehearsal on a local chain: nothing here is public' : 'A policy-bounded AI treasury agent, executing on a public chain', `The AI plans and drafts, the owner authorizes, the smart contract enforces limits.\nEvery transaction hash shown is independently verifiable on the public explorer.`, 5);
  // Optional read-only explorer verification recorded after the run (scripts/explorer-proof.mjs). When present it
  // replaces the live explorer clips, which can show "Pending" while the explorer is still indexing.
  const vfile = path.join(dir, 'explorer', 'verification.json');
  const verification = fs.existsSync(vfile) ? JSON.parse(fs.readFileSync(vfile, 'utf8')) : null;
  const steps = verification ? timeline.steps.filter((s) => !s.id.startsWith('explorer')) : timeline.steps;
  steps.forEach((s, i) => {
    addCard(`${String(i + 1).padStart(2, '0')}-card`, `Step ${i + 1} of ${steps.length}`, s.title, '', 2.5);
    const dur = s.end - s.start;
    const ranges = dur <= 30 || !s.keep ? [[s.start, s.end]] : s.keep === 'end' ? [[Math.max(s.start, s.end - 14), s.end]] : [[s.start, s.start + 10], [s.end - 12, s.end]];
    ranges.filter(([a, b]) => b - a >= 0.5).forEach(([a, b], k) => pieces.push({ type: 'clip', src: raw, from: a, to: b, out: path.join(work, `${String(i + 1).padStart(2, '0')}-clip${k}.mp4`) }));
  });
  if (verification) {
    addCard('90-explorer', 'Public explorer verification', 'Every transaction, confirmed on Blockscout', `Recorded ${verification.recordedAt.replace('T', ' ').slice(0, 19)} UTC, after the run. Read-only, no new transactions;
third-party ad requests were blocked. ${verification.items.length} pages: ${verification.allConfirmed ? 'all confirmed' : 'NOT all confirmed'}.`, 4);
    const src = path.join(dir, verification.video);
    verification.items.forEach((it, k) => pieces.push({ type: 'clip', src, from: Math.max(it.start, it.end - 5), to: it.end, out: path.join(work, `91-explorer-${String(k).padStart(2, '0')}.mp4`) }));
  }
  addCard('99-outro', 'Public, verifiable evidence', 'Transaction hashes', 'Receipts, explorer links, AI-agent logs and the unedited recording are in the evidence folder (MANIFEST.json, SHA-256).', 10, timeline.transactions.map((t) => [t.label, t.hash]));

  await cards(cardList);
  for (const p of pieces) {
    if (p.type === 'card') ff(['-loop', '1', '-framerate', String(FPS), '-t', String(p.seconds), '-i', p.png, ...enc, p.out]);
    else ff(['-ss', p.from.toFixed(2), '-to', p.to.toFixed(2), '-i', p.src, ...enc, p.out]);
  }
  const list = path.join(work, 'list.txt');
  fs.writeFileSync(list, pieces.map((p) => `file '${p.out.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const final = path.join(dir, 'recordings', 'agentwallet-demo.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', final]);
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`[edit] ${final} (${(fs.statSync(final).size / 1e6).toFixed(1)} MB) from ${pieces.filter((p) => p.type === 'clip').length} genuine clips`);
  return final;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildDemo(path.resolve(process.argv[2] || path.join(ROOT, 'evidence', 'sepolia'))).catch((e) => { console.error(`[edit] ${e.message}`); process.exit(1); });
}
