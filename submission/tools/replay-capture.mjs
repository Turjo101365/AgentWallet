#!/usr/bin/env node
/**
 * POST-RUN, READ-ONLY replay of the public Ethereum Sepolia run in the redesigned console, screen-recorded.
 *
 *   node submission/tools/replay-capture.mjs
 *
 * Safety:
 * - The backend runs on a temp COPY of backend/data/sepolia (the run's database). The original is never opened.
 * - No backend .env is loaded (AGENT_WALLET_ENV_FILE points at an empty file): no executor key, no LLM key.
 *   The script aborts if /config reports an executor.
 * - The console's wallet is a bridge that (a) forwards only an allowlist of read-only JSON-RPC methods to the public
 *   RPC and (b) signs only the SIWE sign-in text of this console. Every transaction, typed-data or other signing
 *   method is refused. The contract is also paused with its agent revoked, so no transfer could execute anyway.
 * - Owner session: the owner key is read in this process only to sign the off-chain SIWE message, after checking
 *   its address is the public owner. It is never printed or written. A second recording uses a random VIEWER key.
 *
 * Output: evidence/submission/footage/replay-owner.webm, replay-viewer.webm and replay-log.json (segment times and
 * on-screen element rectangles, used to place highlight graphics on the genuine footage).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chromium } = createRequire(path.join(ROOT, 'frontend', 'package.json'))('@playwright/test');
const { ethers } = createRequire(path.join(ROOT, 'backend', 'package.json'))('ethers');
const RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const OWNER = '0x10A0d3247a1446fD30ba40D14e4272206278b5ba';
const OUT = path.join(ROOT, 'evidence', 'submission', 'footage');
const VIEW = { width: 1920, height: 1080 };
const READ_ONLY = new Set(['eth_chainId', 'net_version', 'eth_blockNumber', 'eth_call', 'eth_getBalance', 'eth_getCode', 'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_gasPrice', 'eth_feeHistory', 'eth_maxPriorityFeePerGas', 'eth_getLogs', 'eth_getTransactionCount', 'eth_estimateGas']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

function ownerWallet() {
  const text = fs.readFileSync(path.join(ROOT, 'secrets', 'base-sepolia-wallets.env'), 'utf8');
  const key = /^OWNER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})\s*$/m.exec(text)?.[1];
  if (!key) throw new Error('OWNER_PRIVATE_KEY not found');
  const w = new ethers.Wallet(key);
  if (w.address !== ethers.getAddress(OWNER)) throw new Error('owner key does not match the public owner address; aborting');
  return w;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-replay-'));
fs.cpSync(path.join(ROOT, 'backend', 'data', 'sepolia'), path.join(tmp, 'db'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'empty.env'), '');
const children = [];
async function serve(args, cwd, env, readyUrl) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 400; i++) {
    if (child.exitCode !== null) throw new Error(log.slice(-2000));
    try { if ((await fetch(readyUrl)).ok) return child; } catch {}
    await sleep(300);
  }
  throw new Error(`not ready: ${log.slice(-2000)}`);
}

const apiPort = 31701, webPort = 33701;
const base = `http://127.0.0.1:${apiPort}/api`;
const url = `http://127.0.0.1:${webPort}`;
const provider = new ethers.JsonRpcProvider(RPC, 11155111, { staticNetwork: true });
const log = { createdAt: new Date().toISOString(), note: 'Post-run read-only replay of the public Sepolia run database (copy). Times are seconds from the start of each video.', recordings: {} };

async function record(name, signer, tour) {
  const dir = path.join(tmp, `video-${name}`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEW, recordVideo: { dir, size: VIEW } });
  const page = await context.newPage();
  const t0 = Date.now();
  const rec = { video: `${name}.webm`, role: name.includes('viewer') ? 'viewer' : 'owner', segments: [], marks: [] };
  const now = () => +((Date.now() - t0) / 1000).toFixed(2);
  await page.exposeFunction('__bridge', async ({ method, params = [] }) => {
    if (method === 'personal_sign') {
      const text = ethers.toUtf8String(params[0]);
      if (!text.startsWith(`${new URL(url).host} wants you to sign in`) || !text.includes('Sign in to the AgentWallet operator console')) throw Object.assign(new Error('bridge signs only this console\'s SIWE message'), { code: 4001 });
      return signer.signMessage(text);
    }
    if (method === 'wallet_switchEthereumChain') return null;
    if (!READ_ONLY.has(method)) throw Object.assign(new Error(`read-only bridge refuses ${method}`), { code: 4001 });
    return provider.send(method, params);
  });
  await page.addInitScript(({ address }) => {
    let connected = false;
    const listeners = {};
    window.ethereum = {
      on: (n, f) => (listeners[n] ||= []).push(f),
      removeListener: (n, f) => { listeners[n] = (listeners[n] || []).filter((x) => x !== f); },
      request: async ({ method, params }) => {
        if (method === 'eth_accounts') return connected ? [address] : [];
        if (method === 'eth_requestAccounts') { connected = true; return [address]; }
        if (method === 'eth_chainId') return '0xaa36a7';
        return window.__bridge({ method, params });
      },
    };
  }, { address: signer.address });

  const h = {
    page,
    async seg(id, fn) { const s = { id, start: now() }; await fn(); s.end = now(); rec.segments.push(s); console.log(`[replay] ${name} ${id} ${s.start}–${s.end}s`); },
    async mark(id, locator) {
      const box = await locator.boundingBox().catch(() => null);
      rec.marks.push({ id, t: now(), rect: box ? { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) } : null });
    },
    async nav(href) { await page.locator(`a[href="${href}"]`).first().click(); await page.waitForTimeout(2500); await page.evaluate(() => window.scrollTo(0, 0)); },
    async scrollTo(locator, ms = 1600) {
      const y = await locator.evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 110);
      await page.evaluate(async ({ y, ms }) => {
        const from = window.scrollY, d = y - from, t0 = performance.now();
        await new Promise((res) => { const step = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; window.scrollTo(0, from + d * e); k < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
      }, { y, ms });
      await page.waitForTimeout(400);
    },
    async top(ms = 1400) { await page.evaluate(async (ms) => { const from = window.scrollY, t0 = performance.now(); await new Promise((res) => { const step = (t) => { const k = Math.min(1, (t - t0) / ms); window.scrollTo(0, from * (1 - (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2))); k < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); }); }, ms); },
  };

  await page.goto(url);
  await page.waitForTimeout(2500);
  await h.seg('signin', async () => {
    await h.mark('signin-card', page.getByRole('heading', { name: 'Operator sign-in' }));
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Connect wallet' }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Operator sign-in' }).waitFor({ state: 'detached', timeout: 60000 });
    await page.waitForTimeout(4000);
  });
  await tour(h);
  await page.waitForTimeout(1500);
  await context.close();
  await browser.close();
  const file = fs.readdirSync(dir).find((f) => f.endsWith('.webm'));
  fs.copyFileSync(path.join(dir, file), path.join(OUT, rec.video));
  log.recordings[name] = rec;
}

async function ownerTour(h) {
  const { page } = h;
  await h.seg('overview', async () => {
    for (const [id, sel] of [['treasury', 'Balance'], ['stats', 'Awaiting approval'], ['killswitch', 'Kill switches']]) await h.mark(id, page.getByText(sel, { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded-4xl")][1]'));
    await page.waitForTimeout(5000);
    for (const [id, text] of [['command-center', 'Tell the agent what to do'], ['risk-engine', 'Limits & decisions'], ['autonomy', 'Signed task grants'], ['transactions', 'Transactions'], ['activity', 'Live activity']]) {
      const card = page.getByRole('heading', { name: text, exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded-4xl")][1]');
      await h.scrollTo(card);
      await h.mark(id, card);
      await page.waitForTimeout(3500);
    }
    await h.top();
    await page.waitForTimeout(1500);
  });
  await h.seg('agent', async () => {
    await h.nav('/agent');
    await page.waitForTimeout(1500);
    for (const [id, re] of [['conv-transfer', /^Send 0\.0001 ETH/], ['conv-rejected', /0\.0003/], ['conv-schedule', /^Schedule a one-time payment/]]) {
      const btn = page.locator('button', { hasText: re }).first();
      if (!(await btn.count())) { console.log(`[replay] no conversation ${re}`); continue; }
      await btn.click();
      await page.waitForTimeout(2500);
      await h.mark(`${id}-turn`, page.locator('div.rounded-\\[26px\\]').last());
      const action = page.getByRole('button', { name: /propose_transfer|schedule_payment/ }).last();
      if (await action.count()) { await action.click(); await page.waitForTimeout(800); await h.scrollTo(action, 1200); await h.mark(`${id}-tool`, action.locator('xpath=..')); await page.waitForTimeout(4000); await action.click(); }
      const res = page.getByText('Resulting actions').last();
      if (await res.count()) { await h.scrollTo(res, 1000); await h.mark(`${id}-actions`, res.locator('xpath=..')); }
      await page.waitForTimeout(3500);
      await h.top(900);
    }
  });
  await h.seg('proposals', async () => {
    await h.nav('/proposals');
    await page.getByRole('button', { name: 'Confirmed', exact: true }).click();
    await page.waitForTimeout(2500);
    const cards = page.locator('div.rounded-4xl', { hasText: 'Confirmed on-chain' });
    for (let i = 0; i < Math.min(2, await cards.count()); i++) {
      const card = cards.nth(i);
      await h.scrollTo(card);
      await h.mark(`confirmed-${i}`, card);
      const checks = card.getByText(/^Policy checks/).locator('xpath=..');
      await h.scrollTo(checks, 1200);
      await h.mark(`confirmed-${i}-checks`, checks);
      await page.waitForTimeout(3500);
      const exec = card.getByText(/^Execution: CONFIRMED/).locator('xpath=..');
      await h.scrollTo(exec, 1000);
      await h.mark(`confirmed-${i}-exec`, exec);
      await page.waitForTimeout(3000);
    }
    await h.top(900);
    await page.getByRole('button', { name: 'Failed / blocked', exact: true }).click();
    await page.waitForTimeout(2500);
    const rejected = page.locator('div.rounded-4xl', { hasText: 'Blocked by policy' }).first();
    await h.mark('rejected-card', rejected);
    const checks = rejected.getByText(/^Policy checks/).locator('xpath=..');
    await h.scrollTo(checks, 1200);
    await h.mark('rejected-checks', checks);
    await page.waitForTimeout(4000);
    const alert = rejected.getByText('Blocked by policy', { exact: true }).last().locator('xpath=../..');
    await h.scrollTo(alert, 1000);
    await h.mark('rejected-alert', alert);
    await page.waitForTimeout(4000);
  });
  await h.seg('automation', async () => {
    await h.nav('/automation');
    const task = page.locator('div.rounded-4xl', { hasText: /COMPLETED|ACTIVE/ }).last();
    await h.scrollTo(task);
    await h.mark('task', task);
    await page.waitForTimeout(2500);
    await task.getByRole('button', { name: 'Runs' }).click();
    await page.waitForTimeout(2500);
    await h.mark('task-runs', task);
    await page.waitForTimeout(5000);
  });
  await h.seg('transactions', async () => {
    await h.nav('/transactions');
    await page.waitForTimeout(1500);
    for (const hash of ['0x2c83a855', '0xedeb6b97']) {
      const row = page.locator('li', { hasText: hash }).first();
      await h.scrollTo(row, 1200);
      await h.mark(`tx-${hash}`, row);
      await page.waitForTimeout(3000);
    }
    await h.top(900);
  });
  await h.seg('audit', async () => {
    await h.nav('/audit');
    await page.waitForTimeout(2000);
    await h.mark('audit-badge', page.getByText(/Chain valid/).first());
    await page.waitForTimeout(3000);
    const row = page.getByText('EXECUTION_CONFIRMED').last().locator('xpath=../..');
    await h.scrollTo(row, 1600);
    await h.mark('audit-row', row);
    await page.waitForTimeout(3500);
    await h.top(1200);
  });
  await h.seg('controls', async () => {
    await h.nav('/controls');
    await page.waitForTimeout(1500);
    await h.mark('emergency-card', page.getByText('Pause, unpause & emergency stop').locator('xpath=ancestor::div[contains(@class,"rounded-4xl")][1]'));
    await page.waitForTimeout(4500);
    for (const [id, t] of [['policy-settings', 'Policy settings'], ['limits', 'Spending limits'], ['allowlist', 'Recipient allowlist'], ['agent-key', 'Agent key']]) {
      const card = page.getByRole('heading', { name: t, exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-4xl")][1]');
      await h.scrollTo(card);
      await h.mark(id, card);
      await page.waitForTimeout(3000);
    }
    await h.top(1200);
  });
  await h.seg('security', async () => {
    await h.nav('/security');
    await page.waitForTimeout(2500);
    await h.mark('health', page.getByRole('heading', { name: 'Backend health' }).locator('xpath=ancestor::div[contains(@class,"rounded-4xl")][1]'));
    await h.mark('authority', page.getByRole('heading', { name: 'How authority is split' }).locator('xpath=ancestor::div[contains(@class,"rounded-4xl")][1]'));
    await page.waitForTimeout(5000);
  });
}

async function viewerTour(h) {
  const { page } = h;
  await h.seg('viewer-overview', async () => { await page.waitForTimeout(3500); await h.mark('role-badge', page.getByText('viewer', { exact: true })); await page.waitForTimeout(1500); });
  await h.seg('viewer-controls', async () => {
    await h.nav('/controls');
    await page.waitForTimeout(1500);
    await h.mark('viewer-alert', page.getByText(/You are signed in as a viewer/).locator('xpath=../..'));
    await h.mark('viewer-emergency', page.getByText('Pause, unpause & emergency stop').locator('xpath=ancestor::div[contains(@class,"rounded-4xl")][1]'));
    await page.waitForTimeout(5000);
  });
  await h.seg('viewer-agent', async () => {
    await h.nav('/agent');
    await page.waitForTimeout(1500);
    await h.mark('viewer-agent-alert', page.getByText('Only the contract owner can use the agent.').locator('xpath=../..'));
    await page.waitForTimeout(4000);
  });
  await h.seg('viewer-treasury', async () => {
    await h.nav('/treasury');
    await page.waitForTimeout(1500);
    await h.mark('viewer-withdraw', page.getByText('Only the contract owner can withdraw.'));
    await page.waitForTimeout(4000);
  });
}

try {
  await serve(['src/server.js'], path.join(ROOT, 'backend'), {
    AGENT_WALLET_ENV_FILE: path.join(tmp, 'empty.env'), NODE_ENV: 'development', PORT: String(apiPort), HOST: '127.0.0.1', CHAIN_ID: '11155111', RPC_URL: RPC,
    DEPLOYMENT_FILE: path.join(ROOT, 'contracts', 'deployments', 'sepolia.json'), PGLITE_DIR: path.join(tmp, 'db'), DATABASE_URL: '',
    AGENT_PRIVATE_KEY: '', AGENT_KEYSTORE_FILE: '', LLM_PROVIDER: 'none', RL_SERVICE_URL: 'http://127.0.0.1:9', CORS_ORIGINS: url, APP_ORIGIN: url, LOG_LEVEL: 'warn', INDEXER_BLOCK_RANGE: '2000',
  }, `${base}/config`);
  const cfg = (await (await fetch(`${base}/config`)).json()).data;
  if (cfg.executorEnabled || cfg.executorAddress) throw new Error('executor unexpectedly configured; aborting');
  console.log(`[replay] backend: chain ${cfg.chainId}, contract ${cfg.contractAddress}, executor disabled, LLM none, DB = temp copy`);
  await serve(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], path.join(ROOT, 'frontend'), { VITE_API_URL: base }, url);
  await sleep(8000);
  await record('replay-owner', ownerWallet(), ownerTour);
  await record('replay-viewer', ethers.Wallet.createRandom(), viewerTour);
  fs.writeFileSync(path.join(OUT, 'replay-log.json'), JSON.stringify(log, null, 2));
  console.log(`[replay] done → ${OUT}`);
} finally {
  for (const c of children.reverse()) if (c.exitCode === null) c.kill();
  provider.destroy();
}
process.exit(0);
