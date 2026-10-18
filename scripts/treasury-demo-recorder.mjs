#!/usr/bin/env node
/**
 * Records the judge Treasury A/B demonstration on the deployed site with Playwright (1920×1080 video, trace, timestamped
 * screenshots, redacted API log).
 *
 *   node scripts/treasury-demo-recorder.mjs --test --out <dir>
 *       Read-only recording test. Every non-GET API request is blocked; nothing is created.
 *   node scripts/treasury-demo-recorder.mjs --demo --out <dir> --invite-file <path> --i-approve-one-sepolia-payment
 *       The approved demonstration: one invited session, obligations A and B, AI plan, exactly one confirmation of A,
 *       then B's policy check. Refuses to confirm unless the treasury shows 0.0004 balance and 0.0003 reserve.
 *
 * Secrets: the invite is read from a local file and typed into a masked field; the session token, invite and cookies
 * are never written to the log; the API log keeps only method, path, status and selected, redacted fields.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(ROOT, 'frontend', 'package.json'))('@playwright/test');
const SITE = 'https://agentwallet-judge.vercel.app';
const API = 'https://agentwallet-judge-api.onrender.com/api';
const RECIPIENT = '0xd85cdB676877ccdc8873B63DEf51B456568604F5';
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const mode = flag('--demo') ? 'demo' : flag('--test') ? 'test' : null;
if (!mode) throw new Error('Pass --test or --demo');
const OUT = path.resolve(opt('--out') || path.join(ROOT, 'work', `treasury-demo-${mode}`));
if (mode === 'demo' && !flag('--i-approve-one-sepolia-payment')) throw new Error('The demonstration needs --i-approve-one-sepolia-payment');
fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'video'), { recursive: true });

const t0 = Date.now();
const stamp = () => new Date().toISOString();
const logFile = path.join(OUT, 'run-log.jsonl');
const log = (event, data = {}) => { const line = JSON.stringify({ at: stamp(), t: ((Date.now() - t0) / 1000).toFixed(1), event, ...data }); fs.appendFileSync(logFile, line + '\n'); console.log(line); };
const REDACT = /("token"\s*:\s*")[^"]+|("inviteCode"\s*:\s*")[^"]+|(Bearer\s+)[A-Za-z0-9._-]+|(aw-)[A-Za-z0-9_-]{8,}/g;
const redact = (s) => String(s).replace(REDACT, (_m, a, b, c, d) => `${a || b || c || d}[REDACTED]`);

// Visible cursor and click ripple (headless video has no OS cursor); invite input masked on screen.
const OVERLAY = `(() => {
  const css = '#aw-cursor{position:fixed;z-index:2147483647;width:22px;height:22px;border-radius:50%;background:rgba(20,20,20,.85);border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.35);pointer-events:none;transform:translate(-50%,-50%);transition:transform .08s}'
    + '.aw-ripple{position:fixed;z-index:2147483646;width:22px;height:22px;border-radius:50%;border:3px solid #6fd3a0;pointer-events:none;transform:translate(-50%,-50%) scale(1);animation:awr .6s ease-out forwards}'
    + '@keyframes awr{to{transform:translate(-50%,-50%) scale(3.2);opacity:0}}'
    + '#invite{-webkit-text-security:disc !important}';
  const add = () => {
    if (document.getElementById('aw-cursor')) return;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    const c = document.createElement('div'); c.id = 'aw-cursor'; c.style.left = '-50px'; c.style.top = '-50px'; document.body.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', (e) => { c.style.transform = 'translate(-50%,-50%) scale(.75)'; const r = document.createElement('div'); r.className = 'aw-ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
    addEventListener('mouseup', () => { c.style.transform = 'translate(-50%,-50%)'; }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', add); else add();
})();`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, recordVideo: { dir: path.join(OUT, 'video'), size: { width: 1920, height: 1080 } } });
// Traces capture DOM and network (including the session bearer token), so they are recorded only in --test.
if (mode === 'test') await context.tracing.start({ screenshots: true, snapshots: true });
await context.addInitScript(OVERLAY);
const page = await context.newPage();
let mouse = { x: 960, y: 540 };
await page.mouse.move(mouse.x, mouse.y);
let shot = 0;
const screenshot = async (name) => { const f = path.join(OUT, 'screenshots', `${String(++shot).padStart(2, '0')}-${name}.png`); await page.screenshot({ path: f, fullPage: false }); log('screenshot', { file: path.relative(OUT, f) }); };
const pause = (ms) => page.waitForTimeout(ms);
async function glide(locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  if (!b) throw new Error('Element not visible');
  const to = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await page.mouse.move(to.x, to.y, { steps: 25 });
  mouse = to;
  await pause(250);
}
const click = async (locator) => { await glide(locator); await locator.click(); await pause(600); };

// API log: method, path, status and a few safe fields. Writes are blocked entirely in --test.
const apiCalls = [];
let writes = 0;
await page.route(`${API}/**`, async (route) => {
  const req = route.request();
  if (req.method() !== 'GET') {
    writes += 1;
    if (mode === 'test') { log('blocked-write', { method: req.method(), path: new URL(req.url()).pathname }); return route.abort(); }
  }
  return route.continue();
});
page.on('response', async (res) => {
  if (!res.url().startsWith(API)) return;
  const entry = { method: res.request().method(), path: new URL(res.url()).pathname, status: res.status() };
  if (/\/(confirm|prepare|chat)$|\/treasury(\?|$)|\/sandbox-status$/.test(new URL(res.url()).pathname) || /\/treasury\?/.test(res.url())) {
    try {
      const d = (await res.json()).data || {};
      entry.summary = JSON.parse(redact(JSON.stringify({
        status: d.status, balanceWei: d.balanceWei, reserveWei: d.reserveWei, availableWei: d.availableWei, health: d.health,
        plan: d.plan?.payments?.map((p) => ({ label: p.recipientLabel, recommendation: p.recommendation, reasons: p.reasons })),
        proposal: d.proposal ? { id: d.proposal.id, status: d.proposal.status, violations: d.proposal.policyResult?.violations?.map((v) => v.id) } : undefined,
        receipt: d.receipt, txHash: d.execution?.txHash, model: d.model, text: d.text, actions: d.actions,
        proposals: d.proposals?.map((p) => ({ id: p.id, status: p.status })),
        session: d.session, executionEnabled: d.executionEnabled, limits: d.limits,
      })));
    } catch { /* non-JSON */ }
  }
  apiCalls.push(entry);
  log('api', entry);
});
page.on('pageerror', (e) => log('page-error', { message: redact(e.message) }));

let outcome = 'INCOMPLETE';
try {
  log('start', { mode, site: SITE });
  await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 180000 });
  await pause(1500);
  await screenshot('welcome');

  if (mode === 'test') {
    await glide(page.getByRole('button', { name: /Judge/ }).first());
    await glide(page.getByRole('button', { name: /Use demo wallet/ }));
    await click(page.locator('#invite'));
    await page.keyboard.type('masking-check-only', { delay: 40 });
    await screenshot('invite-masked');
    await page.locator('#invite').fill('');
    await page.goto(SITE + '/evidence/receipts', { waitUntil: 'networkidle', timeout: 180000 });
    await page.locator('tbody tr').first().waitFor({ timeout: 150000 });
    await glide(page.locator('tbody tr').nth(5));
    await page.mouse.wheel(0, 600); await pause(1200);
    await screenshot('evidence');
    outcome = writes === 0 ? 'TEST_OK_NO_WRITES' : 'TEST_BLOCKED_WRITES';
  } else {
    const invite = fs.readFileSync(path.resolve(opt('--invite-file')), 'utf8').trim();
    if (!/^aw-[A-Za-z0-9_-]{8,}$/.test(invite)) throw new Error('Invite file does not contain one invite code');
    // 1. Judge → demo wallet → invite (masked)
    await glide(page.getByRole('button', { name: /Judge/ }).first());
    await glide(page.getByRole('button', { name: /Use demo wallet/ }));
    await click(page.locator('#invite'));
    await page.keyboard.type(invite, { delay: 35 });
    await click(page.getByRole('button', { name: /Enter with live transactions/ }));
    await page.getByTestId('demo-mode-banner').waitFor({ timeout: 150000 });
    await pause(1500);
    await screenshot('judge-demo-wallet');

    // 2. Treasury precondition gate: balance 0.0004, reserve 0.0003, available 0.0001.
    await page.goto(SITE + '/treasury', { waitUntil: 'networkidle', timeout: 150000 });
    await page.getByTestId('Treasury balance').waitFor({ timeout: 150000 });
    const read = async (id) => (await page.getByTestId(id).textContent()).trim();
    const pre = { balance: await read('Treasury balance'), reserve: await read('Protected balance'), available: await read('Available to spend') };
    log('treasury-precondition', pre);
    await screenshot('treasury-before');
    if (pre.balance !== '0.0004 ETH' || pre.reserve !== '0.0003 ETH' || pre.available !== '0.0001 ETH') throw Object.assign(new Error(`Precondition failed: ${JSON.stringify(pre)}`), { stop: 'PRECONDITION' });

    // 3. Obligations A (HIGH) and B (NORMAL), both due tomorrow.
    const tomorrow = (h) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
    for (const [label, priority, hour, note] of [['Payment A — supplier invoice', 'HIGH', 10, 'Urgent supplier invoice'], ['Payment B — contractor', 'NORMAL', 12, 'Routine contractor payment']]) {
      await click(page.getByLabel('Recipient label')); await page.keyboard.type(label, { delay: 25 });
      await click(page.getByLabel('Approved recipient address')); await page.getByLabel('Approved recipient address').fill(RECIPIENT);
      await click(page.getByLabel('Amount in ETH')); await page.keyboard.type('0.0001', { delay: 60 });
      await page.getByLabel('Due date and time').fill(tomorrow(hour));
      await glide(page.getByLabel('Priority', { exact: true })); await page.getByLabel('Priority', { exact: true }).selectOption(priority);
      await click(page.getByLabel('Description')); await page.keyboard.type(note, { delay: 20 });
      await click(page.getByRole('button', { name: 'Add obligation' }));
      await page.getByRole('heading', { name: `${label} · 0.0001 ETH`, exact: true }).waitFor({ timeout: 60000 });
      log('obligation-created', { label, priority });
    }
    await page.getByText(/Payment A — supplier invoice · 0\.0001 ETH · Fits the plan/).waitFor({ timeout: 60000 });
    await page.getByText(/Payment B — contractor · 0\.0001 ETH · Defer/).waitFor({ timeout: 60000 });
    await glide(page.getByText(/Fits the plan/).first());
    await screenshot('deterministic-plan');

    // 4. Genuine AI (GPT-4.1-mini): inspect obligations, plan, prepare only what fits. One request; no retry.
    await page.goto(SITE + '/agent', { waitUntil: 'networkidle', timeout: 150000 });
    const box = page.getByPlaceholder('Ask your AI assistant…');
    await click(box);
    await page.keyboard.type('Review my treasury obligations, generate the payment plan, and prepare only the payment that fits the plan for my review. Do not prepare anything that would breach the protected reserve.', { delay: 12 });
    const chat = page.waitForResponse((r) => r.url().endsWith('/agent/chat') && r.request().method() === 'POST', { timeout: 180000 });
    await click(page.locator('form').filter({ has: box }).locator('button[type=submit]'));
    const turn = (await (await chat).json()).data || {};
    log('ai-turn', { status: turn.status, model: turn.model, modelCalls: turn.modelCalls, actions: turn.actions, proposals: turn.proposals?.map((p) => ({ id: p.id, status: p.status })) });
    await pause(2500);
    await screenshot('ai-plan');
    let aiPrepared = (turn.proposals || []).some((p) => p.status === 'AWAITING_APPROVAL');

    // 5. Fallback only if the AI did not prepare A: the deterministic "Prepare for review" button.
    if (!aiPrepared) {
      await page.goto(SITE + '/treasury', { waitUntil: 'networkidle', timeout: 150000 });
      await click(page.getByRole('button', { name: 'Prepare for review' }).first());
      await page.waitForURL(/\/proposals/, { timeout: 60000 });
      log('prepared-by', { path: 'deterministic Treasury button (AI did not prepare)' });
    } else log('prepared-by', { path: 'AI tool call prepare_treasury_payment' });

    // 6. Exactly one confirmation of A.
    await page.goto(SITE + '/proposals', { waitUntil: 'networkidle', timeout: 150000 });
    const review = page.getByRole('button', { name: 'Review payment' });
    if (await review.count()) await click(review.first());
    await screenshot('payment-review');
    await click(page.getByTestId('demo-confirm-checkbox'));
    let confirms = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/confirm')) confirms += 1; });
    const confirmRes = page.waitForResponse((r) => r.url().endsWith('/confirm') && r.request().method() === 'POST', { timeout: 200000 });
    await click(page.getByRole('button', { name: 'Confirm demo payment' }));
    const confirmed = await confirmRes;
    const result = (await confirmed.json());
    log('confirm-result', { http: confirmed.status(), confirms, status: result.data?.status, receipt: result.data?.receipt, pending: result.data?.pending, error: result.error?.code });
    if (confirms !== 1) throw Object.assign(new Error('More than one confirmation request was sent'), { stop: 'DUPLICATE' });
    if (confirmed.status() !== 200) throw Object.assign(new Error(`Confirmation refused: ${result.error?.code}`), { stop: 'CONFIRM_REFUSED' });
    fs.writeFileSync(path.join(OUT, 'confirm-result.json'), redact(JSON.stringify({ http: confirmed.status(), data: { id: result.data?.id, status: result.data?.status, intentId: result.data?.intentId, recipient: result.data?.recipient, amountWei: result.data?.amountWei, approvalKind: result.data?.approvalKind, approvedBy: result.data?.approvedBy, execution: result.data?.execution, receipt: result.data?.receipt, pending: result.data?.pending, demo: result.data?.demo } }, null, 2)));
    if (result.data?.receipt) await page.getByTestId('demo-receipt').waitFor({ timeout: 30000 });
    await pause(2000);
    await screenshot('receipt');

    // 7. Treasury after A, then B's policy check (expected BALANCE_AND_RESERVE, no transaction).
    await page.goto(SITE + '/treasury', { waitUntil: 'networkidle', timeout: 150000 });
    await page.getByTestId('Treasury balance').waitFor({ timeout: 60000 });
    log('treasury-after-a', { balance: await read('Treasury balance'), reserve: await read('Protected balance'), available: await read('Available to spend') });
    await glide(page.locator('article', { hasText: 'Payment A — supplier invoice' }));
    await screenshot('a-paid');
    const bCheck = page.getByRole('button', { name: 'Check payment policy' });
    await click(bCheck.first());
    await page.getByText('Payment was not authorized').waitFor({ timeout: 60000 });
    await glide(page.getByText('Payment was not authorized'));
    await pause(1500);
    await screenshot('b-rejected');

    // 8. Audit trail.
    await page.goto(SITE + '/audit', { waitUntil: 'networkidle', timeout: 150000 });
    await pause(2500);
    await screenshot('audit');
    outcome = result.data?.status === 'CONFIRMED' ? 'DEMO_A_CONFIRMED' : `DEMO_A_${result.data?.status || 'UNKNOWN'}`;
  }
} catch (err) {
  outcome = err.stop ? `STOPPED_${err.stop}` : 'ERROR';
  log('stopped', { reason: redact(err.message), stop: err.stop || null });
  await screenshot('stopped').catch(() => {});
} finally {
  if (mode === 'test') await context.tracing.stop({ path: path.join(OUT, 'trace.zip') });
  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'api-log.json'), JSON.stringify(apiCalls, null, 2));
  log('end', { outcome, video: videoPath ? path.relative(OUT, videoPath) : null, writes });
}
