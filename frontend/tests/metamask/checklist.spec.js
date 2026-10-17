/**
 * docs/METAMASK_DEMO.md §3 checklist, driven through the REAL MetaMask extension (not the EIP-1193 bridge).
 *
 *   node scripts/setup-metamask.mjs                 # once: official build, checksum-verified
 *   cd frontend && npm run test:metamask             # headed; HEADLESS=1 to hide the window
 *   LIVE_LLM=1 npm run test:metamask                 # also row 9 (paid LLM call; LLM_* from backend/.env)
 *
 * Starts its own Hardhat chain, backend and console on random ports (the demo stack is not touched), imports the
 * public Hardhat dev mnemonic into a throwaway MetaMask profile, and writes test-results/metamask/report.{md,json}
 * with one row per checklist item: PASS / FAIL / BLOCKED, what MetaMask showed, and chain evidence.
 * Local chain only (31337, plus a second local chain 1338 for the wrong-network row).
 */
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import { startTestChain, deployFixture, devWallet } from '../../../backend/test/helpers/chain.js';
import { launchWithMetaMask, onboard, addAccount, selectAccount, handlePopup, nextPopup, popupAppears, dumpUi, randomPassword } from './metamask.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EXTENSION_DIR = process.env.METAMASK_DIR || path.join(root, 'frontend', '.metamask', process.env.METAMASK_VERSION || '13.52.0');
const OUT = path.join(root, 'frontend', 'test-results', 'metamask');
const HARDHAT_CLI = path.join(root, 'contracts', 'node_modules', 'hardhat', 'internal', 'cli', 'cli.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let chain, otherChain, fixture, base, url, webPort, dir, mm, page;
const password = randomPassword();
const processes = [];
const rows = [];
const meta = { started: new Date().toISOString() };

class Blocked extends Error {}

async function serve(args, cwd, env, readyUrl) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  processes.push(child);
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null) throw new Error(log);
    try { if ((await fetch(readyUrl)).ok) return; } catch {}
    await sleep(300);
  }
  throw new Error(`Server not ready: ${log}`);
}

/** A second local Hardhat node with chain id 1338, so "switch to another network" never leaves localhost. */
async function startOtherChain() {
  // Inside contracts/cache (gitignored) so Hardhat finds its local install.
  const cfgDir = path.join(root, 'contracts', 'cache', 'aw-metamask-chain-1338');
  fs.mkdirSync(cfgDir, { recursive: true });
  const cfg = path.join(cfgDir, 'hardhat.config.cjs');
  fs.writeFileSync(cfg, 'module.exports = { solidity: "0.8.24", networks: { hardhat: { chainId: 1338 } } };\n');
  const port = 21000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, [HARDHAT_CLI, '--config', cfg, 'node', '--port', String(port), '--hostname', '127.0.0.1'], { cwd: cfgDir, stdio: 'ignore' });
  processes.push(child);
  const rpcUrl = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    try {
      const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) });
      if ((await r.json()).result === '0x53a') return { rpcUrl };
    } catch {}
    if (child.exitCode !== null) break;
    await sleep(300);
  }
  return null;
}

const wallet = (method, params = []) => page.evaluate(({ method, params }) => window.ethereum.request({ method, params }), { method, params });
const navigate = (p) => page.locator(`a[href="${p}"]`).first().click();
const excerpt = (t) => (t || '').replace(/\s+/g, ' ').trim().slice(0, 500);
const shotPath = (name) => path.join(OUT, `${name}.png`);
/** Matches an address shown in full or truncated (0x3C44C…293BC) on one line. */
const addr = (a) => new RegExp(`${a.slice(2, 7)}[^\\n]{0,40}${a.slice(-4)}`, 'i');

/** Runs one checklist row; never stops the run, so every row gets a recorded outcome. */
async function row(n, name, fn) {
  const r = { n, name, status: 'FAIL', metamask: [], evidence: {}, notes: [] };
  rows.push(r);
  // MM_ROWS=1,2,3,10 runs only those rows (rows 1-3 connect and sign in, so later rows need them).
  if (process.env.MM_ROWS && !process.env.MM_ROWS.split(',').map(Number).includes(n)) { r.status = 'NOT RUN'; return; }
  try {
    await fn(r);
    r.status = 'PASS';
  } catch (err) {
    r.status = err instanceof Blocked ? 'BLOCKED' : 'FAIL';
    const lines = err.message.replace(/\u001b\[\d+m/g, '').split('\n');
    r.notes.push([lines[0], lines.find((l) => /Locator:/.test(l))].filter(Boolean).join(' ').slice(0, 400));
    for (const p of mm.context.pages()) if (p.url().startsWith(mm.url(''))) await dumpUi(p, path.join(OUT, `row-${n}-metamask-ui.json`));
  } finally {
    r.account = await wallet('eth_accounts').then((a) => a[0] || null).catch(() => null);
    r.chainId = await wallet('eth_chainId').then((c) => parseInt(c, 16)).catch(() => null);
    await page.screenshot({ path: shotPath(`row-${n}-console`) }).catch(() => {});
    console.log(`[row ${n}] ${r.status} ${r.name}${r.notes.length ? ` - ${r.notes.join('; ')}` : ''}`);
    // Close any MetaMask window left open so the next row starts clean.
    for (const p of mm.context.pages()) if (p.url().startsWith(mm.url('notification.html'))) await p.close().catch(() => {});
  }
}

async function popup(r, label, opts) {
  const res = await handlePopup(mm, { shot: shotPath(`row-${r.n}-${label}`), ...opts });
  r.metamask.push(`${label}: ${excerpt(res.text)}`);
  if (res.warning) { r.evidence.metamaskWarning = res.warning; throw new Error(`MetaMask showed a warning, request rejected: ${res.warning}`); }
  if (opts.approve && res.missing.length) throw new Error(`MetaMask request did not show ${res.missing.join(', ')}; rejected it`);
  return res;
}

/** Asks MetaMask to connect another account to this site (wallet_requestPermissions) and ticks HD account #1. */
async function connectSecondAccount(r) {
  await page.evaluate(() => { window.__perm = window.ethereum.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] }).catch((e) => e.code); });
  const pop = await nextPopup(mm, 20000);
  await pop.getByRole('button').first().waitFor({ timeout: 30000 });
  await dumpUi(pop, path.join(OUT, 'row-10-permissions-1.json'));
  await pop.screenshot({ path: shotPath('row-10-permissions-1') });
  // The connect screen lists the selected account; opening it shows "Select accounts" with a check per account.
  const cell = (i) => pop.locator(`[data-testid^="multichain-account-cell-entropy:"][data-testid$="/${i}"]`).first();
  await cell(0).click();
  await pop.getByTestId('connect-more-accounts-button').waitFor();
  await cell(1).click();
  await sleep(500);
  await pop.screenshot({ path: shotPath('row-10-permissions-2') });
  await pop.getByTestId('connect-more-accounts-button').click(); // Save
  await pop.getByTestId('confirm-btn').click(); // Connect
  await pop.waitForEvent('close', { timeout: 10000 }).catch(() => {});
  r.evidence.permittedAfterGrant = await page.evaluate(() => window.__perm.then((p) => (Array.isArray(p) ? p.map((x) => x.parentCapability) : p)));
  r.metamask.push('permissions: connected HD account #1 to the site');
}

async function signIn(r, expectedBadge) {
  await page.getByRole('button', { name: 'Sign in', exact: false }).click();
  const res = await popup(r, 'sign-in', { approve: true, mustShow: [/localhost/, /does not authorize any transaction/i] });
  r.evidence.signInShowsPort = res.text.includes(`localhost:${webPort}`);
  await expect(page.getByText(expectedBadge, { exact: true })).toBeVisible({ timeout: 20000 });
}

async function createProposal(memo, amount) {
  await page.getByLabel('Recipient (must be on the on-chain allowlist)').fill(fixture.payeeA.address);
  await page.getByLabel('Amount (ETH)').fill(amount);
  await page.getByLabel('Memo (optional)').fill(memo);
  const response = page.waitForResponse((res) => res.url() === `${base}/proposals` && res.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create proposal' }).click();
  const res = await response;
  expect(res.status()).toBe(201);
  return (await res.json()).data;
}

function writeReport() {
  fs.mkdirSync(OUT, { recursive: true });
  meta.finished = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ meta, rows }, null, 2));
  const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const md = [
    `# Real MetaMask checklist run (${meta.started})`,
    '',
    `- MetaMask ${meta.metamaskVersion ?? '?'} (official build from ${EXTENSION_DIR}); Chromium ${meta.browserVersion ?? '?'}; Playwright ${meta.playwrightVersion ?? '?'}, no Synpress`,
    `- Console ${url ?? '?'}; chain ${chain?.rpcUrl ?? '?'} (31337); other local chain ${meta.otherChain ?? 'not started'} (1338); contract ${fixture?.deployment.contractAddress ?? '?'}`,
    meta.setupError ? `- **Setup failed:** ${meta.setupError}` : '',
    '',
    '| # | Row | Result | Account | Chain | What MetaMask showed | Evidence | Notes |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.n} | ${cell(r.name)} | ${r.status} | ${cell(r.account)} | ${cell(r.chainId)} | ${cell(r.metamask.join(' / ').slice(0, 900))} | ${cell(JSON.stringify(r.evidence))} | ${cell(r.notes.join('; '))} |`),
    '',
    'Screenshots: row-N-console.png (console) and row-N-<step>.png (MetaMask request). No onboarding screens are captured.',
  ].filter((l) => l !== null).join('\n');
  fs.writeFileSync(path.join(OUT, 'report.md'), md + '\n');
}

test.beforeAll(async () => {
  test.setTimeout(300000);
  fs.mkdirSync(OUT, { recursive: true });
  // Empty it rather than delete it: on Windows a shell sitting in the folder locks it.
  for (const e of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, e), { recursive: true, force: true });
  meta.playwrightVersion = JSON.parse(fs.readFileSync(path.join(root, 'frontend', 'node_modules', '@playwright', 'test', 'package.json'), 'utf8')).version;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-metamask-'));
    chain = await startTestChain();
    fixture = await deployFixture(chain.provider);
    fs.writeFileSync(path.join(dir, 'deployment.json'), JSON.stringify(fixture.deployment));
    const apiPort = 30000 + Math.floor(Math.random() * 2000);
    webPort = apiPort + 2000;
    base = `http://127.0.0.1:${apiPort}/api`;
    url = `http://localhost:${webPort}`;
    const llm = process.env.LIVE_LLM === '1' ? {} : { LLM_PROVIDER: 'none', ANTHROPIC_API_KEY: '', LLM_API_KEY: '', LLM_BASE_URL: 'http://127.0.0.1:9' };
    await serve(['src/server.js'], path.join(root, 'backend'), {
      NODE_ENV: 'test', PORT: String(apiPort), HOST: '127.0.0.1', CHAIN_ID: '31337', RPC_URL: chain.rpcUrl, DEPLOYMENT_FILE: path.join(dir, 'deployment.json'),
      PGLITE_DIR: path.join(dir, 'pglite'), DATABASE_URL: '', LOCAL_DEV_AGENT_INDEX: '1', AGENT_PRIVATE_KEY: '', RL_SERVICE_URL: 'http://127.0.0.1:9',
      CORS_ORIGINS: url, APP_ORIGIN: url, PROPOSAL_TTL_SECONDS: '600', INDEXER_POLL_MS: '300', SCHEDULER_TICK_MS: '500', LOG_LEVEL: 'warn', ...llm,
    }, `${base}/config`);
    await serve(['node_modules/vite/bin/vite.js', '--host', 'localhost', '--port', String(webPort), '--strictPort'], path.join(root, 'frontend'), { VITE_API_URL: base }, url);
    otherChain = await startOtherChain();
    meta.otherChain = otherChain?.rpcUrl;

    mm = await launchWithMetaMask({ extensionDir: EXTENSION_DIR, headless: process.env.HEADLESS === '1' });
    meta.metamaskVersion = mm.version;
    meta.browserVersion = mm.browserVersion;
    await onboard(mm, { phrase: devWallet(0).mnemonic.phrase, password, diagDir: OUT, log: (m) => console.log(`[metamask] ${m}`) });
    // HD account #1 (Hardhat dev #1) is the non-owner in row 10. Then back to #0, the owner.
    await addAccount(mm, password, 1).catch((e) => { meta.addAccountError = e.message; });
    await selectAccount(mm, password, 0).catch((e) => { meta.selectAccountError = e.message; });
    // Keep the wallet tab (rows 10 and 11 use it); the console gets its own tab.
    page = await mm.context.newPage();
  } catch (err) {
    meta.setupError = err.message.split('\n')[0];
    writeReport();
    throw err;
  }
});

test.afterAll(async () => {
  writeReport();
  await mm?.close();
  for (const child of processes.reverse()) { if (child.exitCode === null) { child.kill(); await new Promise((r) => child.once('exit', r)); } }
  await chain?.stop();
  fs.rmSync(path.join(root, 'contracts', 'cache', 'aw-metamask-chain-1338'), { recursive: true, force: true });
  if (dir) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
});

test('docs/METAMASK_DEMO.md checklist with the real MetaMask extension', async () => {
  test.setTimeout(1200000);
  const owner = fixture.deployment.owner;
  const contract = fixture.deployment.contractAddress;

  await row(1, 'Connect wallet', async (r) => {
    await page.goto(url + '/');
    await page.getByRole('button', { name: 'Connect wallet', exact: false }).click();
    await popup(r, 'connect-reject', { approve: false });
    await expect(page.getByText('You rejected the request in your wallet.')).toBeVisible();
    await page.getByRole('button', { name: 'Connect wallet', exact: false }).click();
    await popup(r, 'connect', { approve: true, mustShow: [/localhost/] });
    await expect(page.getByRole('button', { name: 'Switch network', exact: false })).toBeVisible({ timeout: 20000 });
    r.evidence.connected = (await wallet('eth_accounts'))[0];
    if (r.evidence.connected?.toLowerCase() !== owner.toLowerCase()) throw new Error(`connected ${r.evidence.connected}, expected owner ${owner}`);
  });

  await row(2, 'Switch network', async (r) => {
    await page.getByRole('button', { name: 'Switch network', exact: false }).click();
    for (let i = 0; i < 3 && !(await page.getByRole('button', { name: 'Sign in', exact: false }).isVisible()); i++) {
      await popup(r, `network-${i + 1}`, { approve: true, timeoutMs: 8000 }).catch((e) => { if (i === 0) throw e; });
      await sleep(1000);
    }
    await expect(page.getByRole('button', { name: 'Sign in', exact: false })).toBeVisible({ timeout: 20000 });
    r.evidence.walletChainId = parseInt(await wallet('eth_chainId'), 16);
    expect(r.evidence.walletChainId).toBe(31337);
  });

  await row(3, 'Sign in (SIWE) as owner', async (r) => {
    await signIn(r, 'owner');
  });

  await row(4, 'Confirm in wallet 0.001 ETH to Acme (#2)', async (r) => {
    await navigate('/proposals');
    const before = await chain.provider.getBalance(fixture.payeeA.address);
    r.evidence.proposalId = (await createProposal('MetaMask row 4', '0.001')).id;
    await page.getByRole('button', { name: 'Confirm in wallet' }).first().click();
    const { text } = await popup(r, 'typed-data', { approve: true, mustShow: [/ApproveTransfer/, addr(contract), '1000000000000000', addr(fixture.payeeA.address)] });
    if (!/AgentWallet Operator Approval/i.test(text)) r.notes.push('domain name "AgentWallet Operator Approval" not shown; MetaMask shows primary type ApproveTransfer and the verifying contract');
    r.evidence.fieldsShown = ['proposalId', 'intentId', 'token', 'recipient', 'amount', 'deadline'].filter((f) => new RegExp(f, 'i').test(text));
    if (r.evidence.fieldsShown.length < 6) r.notes.push('not every approval field was visible in MetaMask');
    await expect(page.getByText('Execution: CONFIRMED')).toBeVisible({ timeout: 60000 });
    const txHash = (await page.getByText(/^Tx: 0x/).first().textContent()).match(/0x[0-9a-f]{64}/i)[0];
    const receipt = await chain.provider.getTransactionReceipt(txHash);
    Object.assign(r.evidence, { txHash, block: receipt.blockNumber, status: receipt.status });
    expect(receipt.status).toBe(1);
    expect((await chain.provider.getBalance(fixture.payeeA.address)) - before).toBe(ethers.parseEther('0.001'));
    await navigate('/transactions');
    await expect(page.getByText(txHash, { exact: true })).toBeVisible({ timeout: 30000 });
  });

  await row(5, 'Reject the approval in MetaMask', async (r) => {
    await navigate('/proposals');
    const before = await chain.provider.getBalance(fixture.payeeA.address);
    r.evidence.proposalId = (await createProposal('MetaMask row 5', '0.001')).id;
    await page.getByRole('button', { name: 'Confirm in wallet' }).first().click();
    await popup(r, 'typed-data-reject', { approve: false });
    await expect(page.getByText('You rejected the request in your wallet.')).toBeVisible({ timeout: 15000 });
    expect(await chain.provider.getBalance(fixture.payeeA.address)).toBe(before);
    r.evidence.balanceUnchanged = true;
    // Clear it in the console so later rows find only their own proposal.
    await page.getByRole('button', { name: 'Reject', exact: true }).first().click();
    await expect(page.getByText('Rejected by operator in console', { exact: false }).first()).toBeVisible();
  });

  await row(6, 'Pause contract, then Unpause', async (r) => {
    await navigate('/controls');
    for (const [button, want] of [['Pause contract', true], ['Unpause contract', false]]) {
      await page.getByRole('button', { name: button, exact: true }).click();
      await popup(r, button.split(' ')[0].toLowerCase(), { approve: true, mustShow: [addr(contract)] });
      const done = page.getByText(new RegExp(`${button}: confirmed in block \\d+`));
      await expect(done).toBeVisible({ timeout: 60000 });
      r.evidence[`${button.split(' ')[0].toLowerCase()}Block`] = Number((await done.textContent()).match(/block (\d+)/)[1]);
      expect(await fixture.wallet.paused()).toBe(want);
    }
  });

  await row(7, 'Treasury deposit 0.01 ETH', async (r) => {
    await navigate('/treasury');
    const before = await chain.provider.getBalance(contract);
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Deposit', exact: true }) });
    await form.getByPlaceholder('Amount').fill('0.01');
    await form.getByRole('button', { name: 'Deposit', exact: true }).click();
    await popup(r, 'deposit', { approve: true, mustShow: [/0\.01/] });
    await expect.poll(async () => (await chain.provider.getBalance(contract)) - before, { timeout: 60000 }).toBe(ethers.parseEther('0.01'));
    const done = page.getByText(/confirmed in block \d+/).first();
    if (await done.isVisible().catch(() => false)) r.evidence.block = Number((await done.textContent()).match(/block (\d+)/)[1]);
    r.evidence.contractWeiAfter = (await chain.provider.getBalance(contract)).toString();
  });

  await row(8, 'Automation task grant (EIP-712)', async (r) => {
    await navigate('/automation');
    await page.getByLabel('Recipient (allowlisted)').selectOption(fixture.payeeA.address);
    await page.getByLabel('Amount per run').fill('0.001');
    await page.getByPlaceholder('Title (optional)').fill('MetaMask row 8 grant');
    await page.getByRole('button', { name: 'Create task', exact: false }).click();
    await page.getByRole('button', { name: 'Sign grant', exact: false }).click();
    const { text } = await popup(r, 'grant', { approve: true, mustShow: [/AuthorizeTask/, addr(contract)] });
    if (!/AgentWallet Task Authorization/i.test(text)) r.notes.push('domain name "AgentWallet Task Authorization" not shown; MetaMask shows primary type AuthorizeTask and the verifying contract');
    r.evidence.fieldsShown = ['amountPerRun', 'maxRuns', 'validUntil'].filter((f) => new RegExp(f, 'i').test(text));
    if (r.evidence.fieldsShown.length < 3) r.notes.push('not every grant field was visible in MetaMask');
    await expect(page.getByText('ACTIVE', { exact: true }).first()).toBeVisible({ timeout: 20000 });
    // Stop the grant so the scheduler does not keep paying during later rows.
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
    await expect(page.getByText('CANCELLED', { exact: true }).first()).toBeVisible();
  });

  await row(9, 'AI agent drafts a proposal; owner approves it', async (r) => {
    if (process.env.LIVE_LLM !== '1') throw new Blocked('needs LIVE_LLM=1 and LLM_* in backend/.env (paid API call)');
    await navigate('/agent');
    const chat = page.waitForResponse((res) => res.url().endsWith('/api/agent/chat') && res.request().method() === 'POST', { timeout: 90000 });
    await page.getByPlaceholder('Ask your AI assistant…').fill('Send 0.005 ETH to my approved supplier.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    r.evidence.popupDuringAgentRun = await popupAppears(mm, 45000);
    if (r.evidence.popupDuringAgentRun) throw new Error('MetaMask opened a request while the agent was working');
    const turn = (await (await chat).json()).data;
    const drafted = (turn.actions || []).find((x) => x.type === 'proposal');
    if (!drafted || drafted.status !== 'AWAITING_APPROVAL') throw new Error(`Agent turn ${turn.status} did not draft an awaiting proposal`);
    r.evidence.agentProposalId = drafted.id;
    r.evidence.agentModel = turn.status;
    await navigate('/proposals');
    // Scope everything to the card of the proposal the agent drafted, never the first card on the page.
    const card = page.getByText(`#${drafted.id.slice(0, 8)}`, { exact: false }).locator('xpath=ancestor::div[contains(@class,"space-y-5")][1]');
    await expect(card.getByText('Awaiting approval', { exact: true })).toBeVisible({ timeout: 30000 });
    await card.getByRole('button', { name: 'Confirm in wallet' }).click();
    await popup(r, 'typed-data', { approve: true, mustShow: [/ApproveTransfer/, addr(contract), '5000000000000000', addr(fixture.payeeA.address), drafted.id] });
    await expect(card.getByText('Execution: CONFIRMED')).toBeVisible({ timeout: 60000 });
    const txHash = (await card.getByText(/^Tx: 0x/).textContent()).match(/0x[0-9a-f]{64}/i)[0];
    const receipt = await chain.provider.getTransactionReceipt(txHash);
    const tx = await chain.provider.getTransaction(txHash);
    const iface = new ethers.Interface(JSON.parse(fs.readFileSync(path.join(root, 'shared', 'abi', 'AgentWallet.json'), 'utf8')).abi);
    const call = iface.parseTransaction({ data: tx.data });
    const executed = receipt.logs.map((l) => { try { return iface.parseLog(l); } catch { return null; } }).find((e) => e?.name === 'TransferExecuted');
    Object.assign(r.evidence, { txHash, block: receipt.blockNumber, status: receipt.status, method: call.name, signedProposalId: call.args[0]?.proposalId ?? null, amountWei: executed?.args.amount.toString() ?? null });
    expect(receipt.status).toBe(1);
    expect(call.name).toBe('executeApprovedTransfer');
    expect(call.args[0].proposalId).toBe(drafted.id);
    expect(executed.args.amount).toBe(ethers.parseEther('0.005'));
  });

  await row(10, 'Switch account in MetaMask', async (r) => {
    if (meta.addAccountError) throw new Blocked(`could not add HD account #1 in MetaMask: ${meta.addAccountError}`);
    await navigate('/');
    // (a) Switch to an account that is NOT connected to this site.
    await selectAccount(mm, password, 1);
    await page.bringToFront();
    await sleep(5000);
    r.evidence.unconnectedSwitch = { pageAccounts: await wallet('eth_accounts'), stillOwner: await page.getByText('owner', { exact: true }).isVisible() };
    if (r.evidence.unconnectedSwitch.stillOwner) {
      r.notes.push('MetaMask only reports accounts connected to the site: switching to unconnected #1 changed nothing for the page, which stayed bound to the owner');
      // (b) Connect #1 to the site too, then switch again: now MetaMask emits accountsChanged.
      await selectAccount(mm, password, 0);
      await page.bringToFront();
      await connectSecondAccount(r);
      await selectAccount(mm, password, 1);
      await page.bringToFront();
    }
    await expect(page.getByText('owner', { exact: true })).toBeHidden({ timeout: 15000 });
    r.evidence.pageAccountsAfterSwitch = await wallet('eth_accounts');
    expect(r.evidence.pageAccountsAfterSwitch[0].toLowerCase()).toBe(devWallet(1).address.toLowerCase());
    // Viewer: a new signature is needed, the role is viewer, and owner-only API calls are refused.
    await signIn(r, 'viewer');
    const token = await page.evaluate(() => Object.values(sessionStorage).map((v) => { try { return JSON.parse(v).token; } catch { return null; } }).find(Boolean));
    const res = await fetch(`${base}/proposals`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ token: ethers.ZeroAddress, recipient: fixture.payeeA.address, amount: '0.001' }) });
    r.evidence.viewerCreateProposalStatus = res.status;
    expect(res.status).toBe(403);
    // Back to the owner: the viewer session must not carry over.
    await selectAccount(mm, password, 0);
    await page.bringToFront();
    await expect(page.getByText('viewer', { exact: true })).toBeHidden({ timeout: 15000 });
    await signIn(r, 'owner');
  });

  await row(11, 'Switch MetaMask to another network', async (r) => {
    if (!otherChain) throw new Blocked('second local chain (1338) did not start');
    r.notes.push('network change requested by the page (wallet_addEthereumChain for local chain 1338) and approved in MetaMask, not picked in MetaMask\'s network menu');
    await navigate('/controls');
    await expect(page.getByRole('button', { name: 'Pause contract', exact: true })).toBeVisible();
    await page.evaluate((rpc) => { window.__switch = window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x53a', chainName: 'Hardhat Local B (1338)', rpcUrls: [rpc], nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } }] }).catch((e) => e.code); }, otherChain.rpcUrl);
    for (let i = 0; i < 3 && !(await page.getByText(/Wrong network \(1338\)/).isVisible()); i++) {
      await popup(r, `other-network-${i + 1}`, { approve: true, timeoutMs: 8000, fallback: i === 0 }).catch((e) => { if (i === 0) throw e; });
      await sleep(1000);
    }
    await expect(page.getByText(/Wrong network \(1338\)/)).toBeVisible({ timeout: 15000 });
    // Signing is blocked: the owner controls are replaced by the network gate, and no MetaMask request opens.
    for (const p of mm.context.pages()) if (p.url().startsWith(mm.url('notification.html'))) await p.close().catch(() => {});
    r.evidence.pauseButtonOffered = await page.getByRole('button', { name: 'Pause contract', exact: true }).isVisible();
    r.evidence.networkGateShown = await page.getByRole('button', { name: 'Switch network', exact: false }).first().isVisible();
    r.evidence.newMetaMaskRequest = await popupAppears(mm, 6000);
    r.evidence.pausedAfterAttempt = await fixture.wallet.paused();
    expect(r.evidence.pauseButtonOffered).toBe(false);
    expect(r.evidence.networkGateShown).toBe(true);
    expect(r.evidence.newMetaMaskRequest).toBe(false);
    expect(r.evidence.pausedAfterAttempt).toBe(false);
    // Back to 31337 from the console's own button.
    await page.getByRole('button', { name: /Wrong network/ }).click();
    // 31337 is already permitted for this site, so MetaMask may switch back without asking.
    await popup(r, 'switch-back', { approve: true, timeoutMs: 5000, fallback: false }).catch(() => r.notes.push('switched back to 31337 without a MetaMask confirmation (chain already permitted for the site)'));
    await expect(page.getByText(/#31337/)).toBeVisible({ timeout: 15000 });
  });

  const failed = rows.filter((r) => r.status === 'FAIL').map((r) => `#${r.n} ${r.name}: ${r.notes.join('; ')}`);
  console.log(`METAMASK_CHECKLIST ${rows.map((r) => `${r.n}=${r.status}`).join(' ')}`);
  expect(failed, 'failed checklist rows (see test-results/metamask/report.md)').toEqual([]);
});
