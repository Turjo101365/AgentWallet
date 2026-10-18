// READ-ONLY QA against the deployed judge site. No session, invite, AI request, sign-in or transaction is created:
// the test fails if the browser sends any non-GET request. Opt-in only.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const site = process.env.JUDGE_HOSTED_URL;
const api = process.env.JUDGE_HOSTED_API_URL;
test.skip(process.env.QA_HOSTED_READONLY !== '1', 'Opt-in: QA_HOSTED_READONLY=1 with JUDGE_HOSTED_URL and JUDGE_HOSTED_API_URL');
const shots = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../work/qa-browser/hosted');
test.use({ trace: 'on' });

let writes = [];
test.beforeEach(async ({ page }) => {
  fs.mkdirSync(shots, { recursive: true });
  writes = [];
  page.on('request', (r) => { if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method())) writes.push(`${r.method()} ${r.url()}`); });
});
test.afterEach(() => { expect(writes, 'the browser must not send any mutating request').toEqual([]); });

test('API: health, exact CORS, operator writes closed, public demo state is execution-disabled', async ({ request }) => {
  test.setTimeout(240000);
  const ready = await request.get(api + '/health/ready', { timeout: 150000 });
  expect(ready.status()).toBe(200);
  const ok = await request.get(api + '/api/public/overview', { headers: { Origin: site } });
  expect(ok.headers()['access-control-allow-origin']).toBe(site);
  expect((await request.get(api + '/api/public/overview', { headers: { Origin: 'https://foreign.example' } })).status()).toBe(403);
  const status = (await (await request.get(api + '/api/demo/status')).json()).data;
  expect(status.executionEnabled).toBe(false);
  for (const k of ['maxTxPerSession', 'dailyTxLimit']) expect(status.limits[k]).toBe(0);
  for (const k of ['dailyAmountEth', 'maxGasPerTxEth', 'sessionGasEth', 'dailyGasEth']) expect(Number(status.limits[k])).toBe(0);
  expect(status.sandbox.contract).toBe('0x59a33154288009e030aa2072De46D32fC7d40d85');
  // Admin endpoints need a SIWE session on the allowlist; anonymous reads are refused.
  expect((await request.get(api + '/api/admin/demo')).status()).toBe(401);
});

test('Judge onboarding, Evidence and Admin navigation render without creating anything', async ({ page }) => {
  test.setTimeout(240000);
  await page.goto(site + '/');
  await expect(page.getByRole('heading', { name: /Who are you|1 · / }).first()).toBeVisible({ timeout: 150000 });
  await expect(page.getByRole('button', { name: /Enter in explore mode/ })).toBeVisible();
  await page.screenshot({ path: path.join(shots, 'h1-welcome.png'), fullPage: true });
  await page.goto(site + '/evidence/receipts');
  await expect(page.locator('tbody tr')).toHaveCount(12, { timeout: 150000 });
  const links = await page.locator('tbody a').evaluateAll((n) => n.map((a) => a.href));
  expect(links.every((u) => /^https:\/\/sepolia\.etherscan\.io\/tx\/0x[0-9a-f]{64}$/i.test(u))).toBe(true);
  await page.screenshot({ path: path.join(shots, 'h2-evidence.png'), fullPage: true });
  await page.goto(site + '/');
  await page.getByRole('button', { name: /Owner \/ Admin/ }).click();
  await page.getByRole('button', { name: /Continue to admin sign-in/ }).click();
  await expect(page.getByText(/admin/i).first()).toBeVisible();
  expect(await page.evaluate(() => typeof window.ethereum)).toBe('undefined');
  await page.screenshot({ path: path.join(shots, 'h3-admin-entry.png'), fullPage: true });
});

test('mobile: welcome and evidence have no horizontal page overflow', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/', '/evidence/receipts']) {
    await page.goto(site + route);
    await page.waitForLoadState('networkidle', { timeout: 150000 }).catch(() => {});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
  await page.screenshot({ path: path.join(shots, 'h4-mobile-evidence.png'), fullPage: true });
});
