// Opt-in real public RPC reads with a production-built frontend in a fresh browser.
// No wallet bridge, mocked HTTP response, signing key, LLM call or blockchain write.
import { test, expect } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const enabled = process.env.JUDGE_BROWSER === '1';
test.skip(!enabled, 'Set JUDGE_BROWSER=1 to allow read-only Sepolia RPC requests');
let dir, url, api, children = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function serve(args, cwd, overrides, ready) {
  const env = { ...process.env, ...overrides };
  for (const key of ['AGENT_PRIVATE_KEY', 'LOCAL_DEV_AGENT_INDEX', 'AGENT_KEYSTORE_FILE', 'AGENT_KEYSTORE_PASSWORD',
    'AGENT_KEYSTORE_PASSWORD_FILE', 'LLM_API_KEY', 'ANTHROPIC_API_KEY', 'DEPLOYER_PRIVATE_KEY', 'OWNER_PRIVATE_KEY']) delete env[key];
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
  let output = ''; child.stdout.on('data', (d) => { output += d; }); child.stderr.on('data', (d) => { output += d; });
  for (let i = 0; i < 180; i++) {
    if (child.exitCode !== null) throw new Error('Judge test service exited: ' + output);
    try { if ((await fetch(ready)).ok) return; } catch {}
    await pause(500);
  }
  throw new Error('Judge test service did not become ready');
}
test.beforeAll(async () => {
  test.setTimeout(180000);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-judge-'));
  const envFile = path.join(dir, 'empty.env'); fs.writeFileSync(envFile, '');
  const apiPort = 38000 + Math.floor(Math.random() * 1000);
  const webPort = apiPort + 1500; api = `http://127.0.0.1:${apiPort}`; url = `http://localhost:${webPort}`;
  await serve(['src/server.js'], path.join(root, 'backend'), {
    NODE_ENV: 'test', APP_MODE: 'judge', CHAIN_ID: '11155111', BACKGROUND_JOBS: 'false', PORT: String(apiPort),
    HOST: '127.0.0.1', ALLOW_PUBLIC_TESTNET_EXECUTION: 'false', PUBLIC_AI_ENABLED: 'false', LLM_PROVIDER: 'none',
    AGENT_WALLET_ENV_FILE: envFile, PGLITE_DIR: path.join(dir, 'data'), DATABASE_URL: '',
    APP_ORIGIN: url, CORS_ORIGINS: url, RPC_URL: 'https://ethereum-sepolia-rpc.publicnode.com', LOG_LEVEL: 'warn',
  }, api + '/health/ready');
  const built = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
    cwd: path.join(root, 'frontend'), env: { ...process.env, VITE_API_URL: api + '/api', VITE_APP_MODE: 'judge' }, encoding: 'utf8',
  });
  if (built.status !== 0) throw new Error(built.stderr || built.stdout);
  await serve(['node_modules/vite/bin/vite.js', 'preview', '--host', 'localhost', '--port', String(webPort), '--strictPort'],
    path.join(root, 'frontend'), {}, url);
});
test.afterAll(async () => {
  for (const child of children.reverse()) {
    if (child.exitCode === null) { const exited = new Promise((r) => child.once('exit', r)); child.kill(); await exited; }
  }
  // Temporary database is intentionally retained for read-only forensic inspection.
});
test('an incognito judge can inspect real Sepolia evidence with no wallet', async ({ page }) => {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: /The AI plans/ })).toBeVisible();
  await expect(page.getByText('0x3C9389E704331B8a12381F9ab5A68a7F3F59582F', { exact: true })).toBeVisible();
  await expect(page.getByText('No wallet or testnet funds required.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => typeof window.ethereum)).toBe('undefined');
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  await page.screenshot({ path: path.join(root, 'frontend/test-results/judge-overview.png'), fullPage: true });
  await page.getByRole('link', { name: 'On-chain evidence', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'On-chain evidence', exact: true })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(12);
  await expect(page.getByText('26/26 checks passed', { exact: false })).toBeVisible();
  const hashes = await page.locator('tbody a').evaluateAll((nodes) => nodes.map((n) => n.href));
  expect(hashes.every((h) => /^https:\/\/sepolia\.etherscan\.io\/tx\/0x[0-9a-f]{64}$/i.test(h))).toBe(true);
  await page.reload(); // production static server deep-link fallback
  await expect(page.locator('tbody tr')).toHaveCount(12);
});
test('live risk assessment truthfully blocks execution and operator endpoints stay closed', async ({ page }) => {
  await page.goto(url + '/judge/agent');
  await page.getByRole('button', { name: 'Assess transfer risk' }).click();
  await expect(page.getByText('Execution blocked by policy', { exact: true })).toBeVisible();
  await expect(page.getByText('CONTRACT_ACTIVE:', { exact: false })).toBeVisible();
  await expect(page.getByText('Live AI unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask AI assistant' })).toBeDisabled();
  const blocked = await page.request.post(api + '/api/proposals', { data: {} });
  expect(blocked.status()).toBe(403); expect((await blocked.json()).error.code).toBe('JUDGE_READ_ONLY');
});
test('mobile guide is usable without a wallet or horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url + '/judge/guide');
  await expect(page.getByRole('heading', { name: 'Judge quick start' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(root, 'frontend/test-results/judge-mobile-guide.png'), fullPage: true });
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: /The AI plans/ })).toBeVisible();
});
