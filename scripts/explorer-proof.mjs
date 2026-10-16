#!/usr/bin/env node
/**
 * Read-only explorer verification of a finished public run (no keys, no transactions).
 *
 *   node scripts/explorer-proof.mjs evidence/sepolia
 *
 * Records a separate video visiting Blockscout for the contract and every transaction in <dir>/timeline.json.
 * Each page is reloaded until the explorer has indexed it (status Success, no "Pending"), because explorer
 * indexing can lag the chain by minutes. Requests to third-party hosts (sponsored banners) are blocked like an
 * ad blocker would; the explorer's own pages and data are untouched. The recording time is stated on screen.
 *
 * Output: <dir>/recordings/raw/explorer-verification.webm, <dir>/explorer/NN-*.png and
 * <dir>/explorer/verification.json (per item: what the explorer showed, when, with its timeline in the video).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(ROOT, 'frontend', 'package.json'))('@playwright/test');
const EXPLORER = { 11155111: 'https://eth-sepolia.blockscout.com', 84532: 'https://base-sepolia.blockscout.com' };
const VIEW = { width: 1440, height: 900 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function recordExplorerProof(dir) {
  const timeline = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
  const evidence = JSON.parse(fs.readFileSync(path.join(dir, 'evidence.json'), 'utf8'));
  const base = EXPLORER[timeline.chainId];
  if (!base) throw new Error(`No public explorer for chain ${timeline.chainId}`);
  const own = new URL(base).hostname.split('.').slice(-2).join('.'); // blockscout.com
  const outDir = path.join(dir, 'explorer');
  const rawDir = path.join(dir, 'recordings', 'raw');
  fs.mkdirSync(outDir, { recursive: true });
  const tmpVideo = path.join(rawDir, '_explorer');
  fs.mkdirSync(tmpVideo, { recursive: true });

  const items = [{ label: 'AgentWallet contract', kind: 'address', id: evidence.contract.address }, ...timeline.transactions.map((t) => ({ label: t.label, kind: 'tx', id: t.hash }))];
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEW, recordVideo: { dir: tmpVideo, size: VIEW } });
  await context.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === own || host.endsWith(`.${own}`) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  const t0 = Date.now();
  const results = [];
  const banner = async (text) => page.evaluate((t) => {
    let el = document.getElementById('__aw_note');
    if (!el) { el = document.createElement('div'); el.id = '__aw_note'; el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#064e3b;color:#ecfdf5;font:600 15px system-ui;padding:9px 18px'; document.body.appendChild(el); }
    el.textContent = t;
  }, text).catch(() => {});
  for (const [i, it] of items.entries()) {
    const url = `${base}/${it.kind}/${it.id}`;
    const start = (Date.now() - t0) / 1000;
    let text = '';
    let ok = false;
    for (let attempt = 0; attempt < 8 && !ok; attempt++) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await sleep(5000);
      text = (await page.innerText('body').catch(() => '')).replace(/\s+/g, ' ');
      ok = it.kind === 'tx' ? /Success/.test(text) && !/\bPending\b/.test(text) : /Contract/.test(text) && !/Address details EOA/.test(text);
      if (!ok) await sleep(15000);
    }
    const checkedAt = new Date().toISOString();
    await banner(`Explorer verification recorded ${checkedAt.replace('T', ' ').slice(0, 19)} UTC, after the run · read-only · third-party ad requests blocked · ${it.label}`);
    await sleep(3500);
    const shot = `explorer/${String(i + 1).padStart(2, '0')}-${it.kind}-${it.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)}.png`;
    await page.screenshot({ path: path.join(dir, shot) });
    const block = /Block\s+(\d{6,})/.exec(text)?.[1] || null;
    results.push({ label: it.label, kind: it.kind, id: it.id, url, explorerShows: ok ? (it.kind === 'tx' ? 'Success' : 'Contract') : 'NOT CONFIRMED BY EXPLORER', block, checkedAt, screenshot: shot, start, end: (Date.now() - t0) / 1000 });
    console.log(`[explorer] ${ok ? '✓' : '✗'} ${it.label}: ${url}`);
  }
  await context.close();
  await browser.close();
  const file = fs.readdirSync(tmpVideo).find((f) => f.endsWith('.webm'));
  const video = path.join(rawDir, 'explorer-verification.webm');
  fs.renameSync(path.join(tmpVideo, file), video);
  fs.rmSync(tmpVideo, { recursive: true, force: true });
  const summary = { recordedAt: new Date(t0).toISOString(), explorer: base, video: path.relative(dir, video).split(path.sep).join('/'), adRequestsBlocked: true, allConfirmed: results.every((r) => !r.explorerShows.startsWith('NOT')), items: results };
  fs.writeFileSync(path.join(outDir, 'verification.json'), JSON.stringify(summary, null, 2));
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  recordExplorerProof(path.resolve(process.argv[2] || path.join(ROOT, 'evidence', 'sepolia')))
    .then((s) => { console.log(`[explorer] ${s.items.length} pages, all confirmed: ${s.allConfirmed}`); process.exit(s.allConfirmed ? 0 : 2); })
    .catch((e) => { console.error(`[explorer] ${e.message}`); process.exit(1); });
}
