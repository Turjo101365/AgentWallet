// Approval-only smoke against the actual hosted website. Never starts a substitute AI service.
import { test, expect } from '@playwright/test';
const site = process.env.JUDGE_HOSTED_URL;
const api = process.env.JUDGE_HOSTED_API_URL;
const enabled = process.env.RUN_APPROVED_HOSTED_AI === '1';
test.skip(!enabled, 'Requires explicit provisioning/API-spend approval and real hosted URLs');
test.beforeAll(() => {
  for (const url of [site, api]) {
    if (!url || new URL(url).protocol !== 'https:' || new URL(url).origin !== url) throw new Error('Use exact approved HTTPS site and API origins');
  }
  const approved = Number(process.env.HOSTED_BROWSER_AI_APPROVED_USD);
  if (!(approved >= 0.037 && approved <= 0.04)) throw new Error('One paid browser analysis requires explicit approval of $0.037–$0.04');
});
test('first public release has real AI, wallet-free evidence, HTTPS, exact CORS and mobile navigation', async ({ page, request }) => {
  test.setTimeout(240000);
  const ready = await request.get(api + '/health/ready', { timeout: 120000 });
  expect(ready.status()).toBe(200);
  expect((await ready.json()).ai).toMatchObject({ required: true, configured: true });
  const overview = await request.get(api + '/api/public/overview', { headers: { Origin: site } });
  expect(overview.headers()['access-control-allow-origin']).toBe(site);
  expect(overview.headers()['access-control-allow-credentials']).toBeUndefined();
  expect((await request.get(api + '/api/public/overview', { headers: { Origin: 'https://foreign.example' } })).status()).toBe(403);
  expect((await request.post(api + '/api/proposals', { data: {} })).status()).toBe(403);
  await page.goto(site + '/judge/evidence');
  await expect(page.locator('tbody tr')).toHaveCount(12, { timeout: 150000 });
  await expect(page.getByText('26/26 checks passed', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => typeof window.ethereum)).toBe('undefined');
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  const links = await page.locator('tbody a').evaluateAll((nodes) => nodes.map((n) => n.href));
  expect(links.every((url) => /^https:\/\/sepolia\.etherscan\.io\/tx\/0x[0-9a-f]{64}$/i.test(url))).toBe(true);
  await page.reload(); await expect(page.locator('tbody tr')).toHaveCount(12);
  await page.getByRole('link', { name: 'AI & risk analysis', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ask AI assistant' })).toBeEnabled();
  await page.getByLabel('Question', { exact: true }).fill('In two sentences explain why this public demonstration cannot spend funds. Do not call a tool.');
  const response = page.waitForResponse((r) => r.url() === api + '/api/public/analyze' && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Ask AI assistant' }).click(); // Exactly one paid submission; no retries.
  const ai = await response; expect(ai.status()).toBe(200);
  const { data } = await ai.json();
  expect(data.status).toBe('COMPLETED'); expect(data.model).toBe('gpt-4.1-mini');
  expect(data.executesTransaction).toBe(false); expect(data.text.length).toBeGreaterThan(0);
  expect(data.usage.inputTokens).toBeGreaterThan(0); expect(data.usage.outputTokens).toBeGreaterThan(0);
  const estimatedUsd = (data.usage.inputTokens * 0.40 + data.usage.outputTokens * 1.60) / 1_000_000;
  expect(estimatedUsd).toBeLessThanOrEqual(Number(process.env.HOSTED_BROWSER_AI_APPROVED_USD));
  console.log(JSON.stringify({ realHostedAi: true, estimatedUsd, usage: data.usage }));
  await expect(page.getByText('COMPLETED · AI-generated explanation')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Judge guide', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Judge quick start' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/judge-hosted-live-mobile.png', fullPage: true });
});
