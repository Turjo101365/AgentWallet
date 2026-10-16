/**
 * Helpers that drive the REAL MetaMask extension (official Chrome build) in an isolated Chromium profile.
 *
 * Safety rules this file keeps:
 * - The profile is a fresh temp directory, deleted afterwards. A personal Chrome/MetaMask profile is never used.
 * - The wallet is the public Hardhat dev mnemonic (local chain only). It is never logged, and nothing is
 *   screenshotted or traced during onboarding. The unlock password is random per run and kept in memory.
 * - A "suspicious / deceptive request" warning from MetaMask is never acknowledged. The request is rejected
 *   and the warning recorded.
 *
 * MetaMask's UI changes between releases, so every step tries several known selectors (data-testid first,
 * then visible text). When a step fails, `dumpUi` writes the visible test ids and button labels (no input
 * values) next to the report so the selector can be fixed.
 */
import { chromium } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** First visible locator among the candidates, or null. Candidates: 'testid' strings or RegExp (button/link text). */
async function firstVisible(page, candidates, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const c of candidates) {
      const loc = c instanceof RegExp
        ? page.getByRole('button', { name: c }).or(page.getByRole('link', { name: c })).first()
        : page.getByTestId(c).first();
      if (await loc.isVisible().catch(() => false)) return loc;
    }
    await sleep(200);
  }
  return null;
}

export async function clickAny(page, candidates, { timeoutMs = 4000, what = 'element' } = {}) {
  const loc = await firstVisible(page, candidates, timeoutMs);
  if (!loc) throw new Error(`MetaMask: no visible ${what} (tried ${candidates.map(String).join(', ')})`);
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await loc.click();
  return loc;
}

/** Visible data-testids and button labels only: no input values, safe to store. */
export async function dumpUi(page, file, { testIdsOnly = false } = {}) {
  try {
    // Locator calls only (isolated world): page.evaluate is blocked by LavaMoat in MetaMask pages.
    const testIds = [];
    for (const el of (await page.locator('[data-testid]').all()).slice(0, 300)) {
      if (await el.isVisible().catch(() => false)) testIds.push(await el.getAttribute('data-testid').catch(() => null));
    }
    const buttons = [];
    if (!testIdsOnly) {
      for (const el of (await page.getByRole('button').all()).slice(0, 80)) {
        if (await el.isVisible().catch(() => false)) buttons.push(((await el.innerText().catch(() => '')) || '').trim().slice(0, 60));
      }
    }
    const ui = { url: new URL(page.url()).pathname + new URL(page.url()).hash, testIds: [...new Set(testIds.filter(Boolean))], buttons };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(ui, null, 2));
    return ui;
  } catch { /* page closed */ }
}

export async function launchWithMetaMask({ extensionDir, headless = false, offline = true }) {
  if (!fs.existsSync(path.join(extensionDir, 'manifest.json'))) {
    throw new Error(`MetaMask build not found in ${extensionDir}. Run: node scripts/setup-metamask.mjs`);
  }
  const version = JSON.parse(fs.readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8')).version;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-metamask-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', // Playwright's Chromium: still honours --load-extension (branded Chrome no longer does).
    headless,
    viewport: { width: 1360, height: 900 },
    // Opt-in screen recording for the submission clips (off by default). Onboarding pages are discarded afterwards.
    ...(process.env.AW_RECORD_DIR ? { recordVideo: { dir: process.env.AW_RECORD_DIR, size: { width: 1360, height: 900 } } } : {}),
    args: [
      `--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`,
      // Local only: nothing resolves except localhost, 127.0.0.1 and the console's icon font. Without this,
      // MetaMask's backup & sync downloads and scrypt-decrypts what strangers stored under the PUBLIC Hardhat
      // mnemonic, which blocks its background ("Background connection unresponsive"). It also keeps MetaMask from
      // querying mainnet balances for the test accounts.
      ...(offline ? ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE fonts.googleapis.com, EXCLUDE fonts.gstatic.com'] : []),
    ],
  });
  // No MetaMask step may wait forever (Playwright's default outside the test runner).
  context.setDefaultTimeout(15000);
  const isExt = (w) => w.url().startsWith('chrome-extension://');
  const sw = context.serviceWorkers().find(isExt) || await context.waitForEvent('serviceworker', { predicate: isExt, timeout: 60000 });
  const id = new URL(sw.url()).host;
  // Never evaluate inside MetaMask's own pages or service worker: LavaMoat scuttling breaks page.evaluate there
  // ("setInterval of globalThis is inaccessible"). Locator actions run in Playwright's isolated world and work.
  const probe = await context.newPage();
  const browserVersion = await probe.evaluate(async () => (await navigator.userAgentData?.getHighEntropyValues(['fullVersionList']))
    ?.fullVersionList?.find((b) => /Chrom/.test(b.brand))?.version || navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1]).catch(() => 'unknown');
  await probe.close();
  return {
    context, id, version, browserVersion,
    url: (p) => `chrome-extension://${id}/${p}`,
    async close() {
      await context.close().catch(() => {});
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    },
  };
}

/**
 * Imports the Hardhat dev mnemonic. Works as a small state machine, because the order of MetaMask's
 * onboarding screens (terms, metrics, import, password, completion) changes between releases.
 */
export async function onboard(mm, { phrase, password, diagDir, log = () => {} }) {
  const { context } = mm;
  await sleep(2000);
  let page = context.pages().find((p) => p.url().startsWith(mm.url(''))) || await context.newPage();
  if (!page.url().startsWith(mm.url(''))) await page.goto(mm.url('home.html#onboarding/welcome'));
  for (const p of context.pages()) if (p !== page && p.url().startsWith(mm.url(''))) await p.close().catch(() => {});

  let srpDone = false;
  let passwordDone = false;
  let idle = 0;
  let metricsSeen = false;
  let completeClickedAt = 0;
  const deadline = Date.now() + (Number(process.env.MM_ONBOARD_MS) || 180000);
  while (Date.now() < deadline) {
    await sleep(600);
    // MetaMask may close the onboarding tab and open the wallet in another one.
    if (page.isClosed()) page = context.pages().find((p) => !p.isClosed() && p.url().startsWith(mm.url('home.html'))) || await context.newPage().then(async (p) => { await p.goto(mm.url('home.html')); return p; });
    const has = async (id) => page.getByTestId(id).first().isVisible().catch(() => false);
    const url = page.url();
    // Done: the wallet home shows the account menu.
    if (!url.includes('onboarding') && (await has('account-menu-icon') || await has('account-options-menu-button'))) return page;

    // Terms of use (welcome checkbox in older builds, scroll-to-agree modal in newer ones).
    if (await has('onboarding-terms-checkbox')) { await page.getByTestId('onboarding-terms-checkbox').click().catch(() => {}); }
    if (await has('terms-of-use-scroll-button')) { log('terms: scroll'); await page.getByTestId('terms-of-use-scroll-button').click(); continue; }
    if (await has('terms-of-use-checkbox')) { await page.getByTestId('terms-of-use-checkbox').check().catch(() => page.getByTestId('terms-of-use-checkbox').click()); }
    if (await has('terms-of-use-agree-button')) { log('terms: agree'); await page.getByTestId('terms-of-use-agree-button').click().catch(() => {}); continue; }

    if (await has('onboarding-import-with-srp-button')) { log('import with SRP'); await page.getByTestId('onboarding-import-with-srp-button').click(); continue; }
    if (await has('onboarding-import-wallet')) { log('existing wallet'); await page.getByTestId('onboarding-import-wallet').click(); continue; }

    // Recovery phrase: one textarea (13.x) or 12 word inputs (older).
    if (!srpDone && await has('srp-input-import__srp-note')) {
      await page.getByTestId('srp-input-import__srp-note').click();
      await page.keyboard.type(phrase, { delay: 5 });
      await clickAny(page, ['import-srp-confirm', /^Continue$/, /Confirm Secret Recovery Phrase/i], { what: 'SRP confirm button' });
      log('SRP entered (textarea)'); srpDone = true; continue;
    }
    if (!srpDone && await has('import-srp__srp-word-0')) {
      const words = phrase.split(' ');
      for (let i = 0; i < words.length; i++) await page.getByTestId(`import-srp__srp-word-${i}`).fill(words[i]);
      await clickAny(page, ['import-srp-confirm'], { what: 'SRP confirm button' });
      log('SRP entered (word inputs)'); srpDone = true; continue;
    }

    // Password.
    if (!passwordDone && (await has('create-password-new-input') || await has('create-password-new'))) {
      const nw = (await has('create-password-new-input')) ? 'create-password-new-input' : 'create-password-new';
      const cf = (await has('create-password-confirm-input')) ? 'create-password-confirm-input' : 'create-password-confirm';
      await page.getByTestId(nw).fill(password);
      await page.getByTestId(cf).fill(password);
      if (await has('create-password-terms')) await page.getByTestId('create-password-terms').click();
      await clickAny(page, ['create-password-submit', 'create-password-import', /Create password|Import my wallet/i], { what: 'password submit' });
      log('password set'); passwordDone = true; continue;
    }

    // Data collection: opt out of every checkbox on the metrics screen before continuing.
    if (url.includes('metametrics') && !metricsSeen) {
      metricsSeen = true;
      for (const box of await page.locator('input[type=checkbox]').all()) {
        if (await box.isChecked().catch(() => false)) { await box.uncheck({ force: true }).catch(() => box.click({ force: true }).catch(() => {})); log('metrics: unchecked an opt-in box'); }
      }
      log(`metrics screen: ${JSON.stringify(await dumpUi(page, path.join(diagDir, 'onboarding-metrics.json')))}`);
    }

    // "Open wallet" greys out after the first click while MetaMask finishes in the background; open the wallet directly.
    if (await has('onboarding-complete-done')) {
      if (!completeClickedAt) { log('completion: open wallet'); completeClickedAt = Date.now(); await page.getByTestId('onboarding-complete-done').click().catch(() => {}); continue; }
      if (Date.now() - completeClickedAt > 10000) { log('completion: button still busy, opening home.html'); await page.goto(mm.url('home.html')).catch(() => {}); completeClickedAt = Date.now(); }
      continue;
    }

    // Metrics, completion, pin-extension and other "next" screens: decline data sharing, otherwise continue.
    const next = await firstVisible(page, [
      'metametrics-no-thanks', 'metametrics-i-agree', 'passkey-maybe-later-button', 'onboarding-complete-done', 'pin-extension-next', 'pin-extension-done',
      'download-app-continue', 'onboarding-privacy-policy', /^No thanks$/i, /^Done$/i, /^Got it$/i, /^Next$/i, /^Continue$/i, /^Open wallet$/i,
    ], 1200);
    if (next) { log(`next: ${await next.getAttribute('data-testid').catch(() => null) || await next.innerText().catch(() => '?')}`); await next.click().catch(() => {}); idle = 0; continue; }
    if (++idle % 8 === 0) log(`idle at ${new URL(url).hash}: ${JSON.stringify((await dumpUi(page, path.join(diagDir, 'onboarding-idle.json'), { testIdsOnly: true }))?.testIds)}`);
  }
  await dumpUi(page, path.join(diagDir, 'onboarding-stuck.json'), { testIdsOnly: true });
  throw new Error('MetaMask onboarding did not finish in 180 s (test ids saved to onboarding-stuck.json)');
}

/** Closes "what's new" and similar popovers on the wallet home. */
async function dismissPopovers(page) {
  for (let i = 0; i < 4; i++) {
    const close = await firstVisible(page, ['popover-close', 'whats-new-modal-close', 'modal-header-close-button', /^Got it$/i, /^Not now$/i, /^No thanks$/i], 800);
    if (!close) return;
    await close.click().catch(() => {});
    await sleep(300);
  }
}

/**
 * The wallet tab. Reuses the tab left open by onboarding: in 13.52 a second home.html tab can stay on
 * "Loading is taking longer than usual" while the first one keeps working.
 */
export async function openHome(mm, password) {
  const isHome = (p) => !p.isClosed() && p.url().startsWith(mm.url('home.html'));
  let page = mm.context.pages().find(isHome);
  if (!page) { page = await mm.context.newPage(); await page.goto(mm.url('home.html')); }
  else if (new URL(page.url()).hash.length > 2) await page.goto(mm.url('home.html#/')).catch(() => {});
  await page.bringToFront().catch(() => {});
  if (await page.getByTestId('unlock-password').isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.getByTestId('unlock-password').fill(password);
    await clickAny(page, ['unlock-submit', /^Unlock$/i], { what: 'unlock button' });
  }
  await page.getByTestId('account-menu-icon').waitFor({ timeout: 20000 }).catch(() => {});
  await dismissPopovers(page);
  return page;
}

// Account cells end with the HD index ("…/0", "…/1"). Names are not used: MetaMask's backup & sync restores
// names stored for this (public) mnemonic, e.g. account #0 shows up as "admin".
const cell = (page, index) => page.locator(`[data-testid^="multichain-account-cell-entropy:"][data-testid$="/${index}"]`).first();

/** Ensures HD account #index exists (adds accounts from the account list until it does). */
export async function addAccount(mm, password, index = 1) {
  const page = await openHome(mm, password);
  await clickAny(page, ['account-menu-icon'], { what: 'account menu' });
  await cell(page, 0).waitFor({ timeout: 20000 });
  for (let i = 0; i < 5 && !(await cell(page, index).isVisible().catch(() => false)); i++) {
    await clickAny(page, ['add-multichain-account-button'], { what: '"add account" button' });
    await cell(page, index).waitFor({ timeout: 10000 }).catch(() => {});
  }
  if (!(await cell(page, index).isVisible().catch(() => false))) throw new Error(`MetaMask: account #${index} not in the account list`);
  await clickAny(page, ['account-list-page-back-button'], { what: 'back button', timeoutMs: 2000 }).catch(() => page.goto(mm.url('home.html#/')));
  await page.getByTestId('account-menu-icon').waitFor({ timeout: 15000 });
}

/** Selects HD account #index (0 = Hardhat owner, 1 = Hardhat dev #1) in the wallet's account list. */
export async function selectAccount(mm, password, index) {
  const page = await openHome(mm, password);
  await clickAny(page, ['account-menu-icon'], { what: 'account menu' });
  await cell(page, index).waitFor({ timeout: 20000 });
  await cell(page, index).click();
  await page.getByTestId('account-menu-icon').waitFor({ timeout: 15000 });
  await sleep(1000);
}

/** Waits for MetaMask's confirmation window (notification.html), or opens it if the window was not caught. */
export async function nextPopup(mm, timeoutMs = 20000, { fallback = true } = {}) {
  const isPopup = (p) => !p.isClosed() && p.url().startsWith(mm.url('notification.html'));
  const existing = mm.context.pages().find(isPopup);
  if (existing) return existing;
  const page = await mm.context.waitForEvent('page', { predicate: isPopup, timeout: timeoutMs }).catch(async () => {
    if (!fallback) throw new Error('MetaMask: no confirmation window opened');
    const p = await mm.context.newPage();
    await p.goto(mm.url('notification.html'));
    return p;
  });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await sleep(1200);
  return page;
}

const APPROVE = ['confirm-footer-button', 'confirm-btn', 'page-container-footer-next', 'confirmation-submit-button', /^Connect$/i, /^Confirm$/i, /^Approve$/i, /^Switch network$/i, /^Sign$/i];
const REJECT = ['confirm-footer-cancel-button', 'cancel-btn', 'page-container-footer-cancel', 'confirmation-cancel-button', /^Cancel$/i, /^Reject$/i];
const WARNING = /suspicious|deceptive|not the site|doesn.t match|mismatch|malicious|phishing/i;

/**
 * Reads the pending MetaMask request, then approves or rejects it.
 * Returns { text, warning, missing }: text is the visible request (no secrets: it is what the user reads), warning is
 * MetaMask's security warning if any (the request is then rejected), missing lists `mustShow` items that were absent
 * (the request is then rejected too).
 */
export async function handlePopup(mm, { approve, shot, timeoutMs, mustShow = [], fallback = true }) {
  const popup = await nextPopup(mm, timeoutMs, { fallback });
  // The window opens on a spinner first; wait for its footer buttons.
  await firstVisible(popup, [...APPROVE, ...REJECT], 30000);
  // Long typed-data requests must be scrolled before "Confirm" enables.
  for (let i = 0; i < 6; i++) {
    const scroll = await firstVisible(popup, ['confirm-scroll-to-bottom', 'signature-request-scroll-button'], 600);
    if (!scroll) break;
    await scroll.click().catch(() => {});
  }
  const text = (await popup.locator('body').innerText().catch(() => '')).replace(/\n{2,}/g, '\n').trim();
  if (shot) await popup.screenshot({ path: shot, fullPage: true }).catch(() => {});
  const warning = WARNING.test(text) ? (text.split('\n').find((l) => WARNING.test(l)) || 'warning shown') : null;
  // Never approve a request whose recipient/amount is not the one the test expects.
  const missing = mustShow.filter((m) => !(m instanceof RegExp ? m.test(text) : text.toLowerCase().includes(String(m).toLowerCase())));
  if (approve && !warning && !missing.length) {
    await clickAny(popup, APPROVE, { what: 'approve button', timeoutMs: 8000 });
  } else {
    await clickAny(popup, REJECT, { what: 'reject button', timeoutMs: 8000 });
  }
  await sleep(800);
  return { text, warning, missing: missing.map(String) };
}

/** True if a MetaMask confirmation window appears within the time limit (used to prove a request was NOT sent). */
export async function popupAppears(mm, timeoutMs) {
  const isPopup = (p) => !p.isClosed() && p.url().startsWith(mm.url('notification.html'));
  if (mm.context.pages().some(isPopup)) return true;
  return !!(await mm.context.waitForEvent('page', { predicate: isPopup, timeout: timeoutMs }).catch(() => null));
}

export function randomPassword() {
  return `${crypto.randomBytes(12).toString('base64url')}Aa1!`;
}
