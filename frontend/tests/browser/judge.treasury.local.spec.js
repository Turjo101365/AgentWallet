import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import { startTestChain, devWallet, artifact } from '../../../backend/test/helpers/chain.js';
import { scriptedProvider, call } from '../../../backend/test/helpers/scriptedLlm.js';
import { openDatabase } from '../../../backend/src/db/index.js';
import { migrate } from '../../../backend/src/db/migrate.js';
import { createLogger } from '../../../backend/src/lib/logger.js';
import { createRateLimits } from '../../../backend/src/middleware/rateLimits.js';
import { requestId, createErrorHandler, notFoundHandler } from '../../../backend/src/middleware/errorHandler.js';
import { createDemoRuntime } from '../../../backend/src/sandbox/demoRuntime.js';
import { createDemoRouter } from '../../../backend/src/routes/demo.js';
import { AGENT_WALLET_ABI } from '../../../backend/src/services/chainService.js';

/**
 * LOCAL judge journey in a real browser: Welcome → Judge → Demo wallet (invite) → Treasury obligations →
 * AI plan (scripted model, no paid call) → prepare → explicit demo confirmation → executed LOCAL transaction → receipt;
 * the second obligation is refused by the reserve. Throwaway Hardhat chain and in-memory database only.
 * Nothing here contacts Sepolia or the hosted services.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const backendRequire = createRequire(path.join(root, 'backend', 'package.json'));
const express = backendRequire('express');
const cors = backendRequire('cors');
const shots = path.join(root, 'work', 'qa-browser');
const ETH = ethers.ZeroAddress;
const W = (v) => ethers.parseEther(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let chain, runtime, budgetDb, server, vite, url, base, recipient, contract, invites;
const script = [];
test.use({ trace: 'on' });

test.beforeAll(async () => {
  test.setTimeout(180000);
  fs.mkdirSync(shots, { recursive: true });
  chain = await startTestChain();
  const owner = devWallet(5), agent = devWallet(6);
  recipient = devWallet(7);
  const signer = new ethers.NonceManager(devWallet(0, chain.provider));
  const A = artifact('AgentWallet');
  const wallet = await new ethers.ContractFactory(A.abi, A.bytecode, signer).deploy(owner.address, agent.address, W('0.001'), W('0.01'));
  await wallet.waitForDeployment();
  contract = await wallet.getAddress();
  await (await signer.sendTransaction({ to: contract, value: W('0.0004') })).wait();
  await (await wallet.connect(owner.connect(chain.provider)).setRecipient(recipient.address, true)).wait();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-qa-browser-'));
  const deploymentFile = path.join(dir, 'sandbox.json');
  fs.writeFileSync(deploymentFile, JSON.stringify({ chainId: 31337, contractAddress: contract, contractVersion: 2, tokens: [{ symbol: 'ETH', address: ETH, decimals: 18, native: true }], demoRecipients: [{ label: 'Approved recipient', category: 'supplier', address: recipient.address }] }));
  const demo = { enabled: true, deploymentFile, contractAddress: contract, ownerAddress: owner.address, agentAddress: agent.address, inviteHashes: [],
    sessionTtlSeconds: 3600, maxTxPerSession: 2, maxAiPerSession: 10, maxAmountWei: W('0.0001'), dailyTxLimit: 3, dailyAmountWei: W('0.0003'),
    minTreasuryEth: '0.0003', minAgentGasEth: '0.0001', maxFeePerGasGwei: '50', executionWaitMs: 30000, maxGasPerTxWei: W('0.005'), sessionGasWei: W('0.01'), dailyGasWei: W('0.02') };
  Object.defineProperty(demo, 'ownerKey', { value: owner.privateKey, enumerable: false });
  Object.defineProperty(demo, 'agentKey', { value: agent.privateKey, enumerable: false });
  budgetDb = await openDatabase({ pgliteDir: 'memory://' });
  await migrate(budgetDb, path.join(root, 'database', 'migrations'));
  const logger = createLogger('silent');
  runtime = await createDemoRuntime({ nodeEnv: 'test', logLevel: 'silent', appOrigin: 'http://127.0.0.1:5173', corsOrigins: ['http://127.0.0.1:5173'], chainId: 31337,
    rpcUrl: chain.rpcUrl, databaseUrl: null, pgliteDir: 'memory://', migrationsDir: path.join(root, 'database', 'migrations'), publicAi: { dailyLimit: 50 }, demo },
  { db: budgetDb, llm: scriptedProvider(script, { name: 'scripted-test', model: 'scripted-test-model' }), logger, extraEnv: { RECEIPT_TIMEOUT_MS: '20000', DAY_BOUNDARY_GUARD_SECONDS: '0', CONFIRMATIONS: '1' } });
  if (!runtime.service) throw new Error(runtime.reason);
  await runtime.sandbox.container.policySettings.update({ reserveFloors: { [ETH]: W('0.0003').toString() } }, owner.address, { via: 'qa-admin' });
  invites = {};
  for (const label of ['live', 'revoked', 'expired']) invites[label] = await runtime.service.createInvite({ label, maxSessions: 1, expiresInHours: 1 }, owner.address);
  await runtime.service.revokeInvite(invites.revoked.id, owner.address);
  await runtime.sandbox.container.db.query("UPDATE demo_invites SET expires_at = now() - interval '1 minute' WHERE id = $1", [invites.expired.id]);

  const apiPort = 32000 + Math.floor(Math.random() * 1500), webPort = apiPort + 1600;
  url = `http://127.0.0.1:${webPort}`;
  base = `http://127.0.0.1:${apiPort}/api`;
  const app = express();
  app.use(requestId);
  app.use(cors({ origin: url, allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'] }));
  app.use(express.json());
  const c = runtime.sandbox.container;
  // Root site config as the hosted judge backend reports it (judge mode), pointing at this local sandbox only.
  app.get('/api/config', (_req, res) => res.json({ success: true, data: { chainId: 31337, appMode: 'judge', networkName: c.config.network.name, isPublicNetwork: false, explorerBaseUrl: null,
    walletRpcUrl: chain.rpcUrl, contractAddress: contract, contractConfigured: true, contractVersion: 2, executorAddress: null, executorEnabled: false, tokens: c.config.tokens, proposalTtlSeconds: 600, chainReady: true, chainError: null, abi: AGENT_WALLET_ABI } }));
  app.use('/api/demo', createDemoRouter({ demoRuntime: runtime, limits: createRateLimits({ disabled: true }) }));
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger, { production: false }));
  server = await new Promise((r) => { const s = app.listen(apiPort, '127.0.0.1', () => r(s)); });
  vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], { cwd: path.join(root, 'frontend'), env: { ...process.env, VITE_API_URL: base, VITE_APP_MODE: 'judge' }, stdio: 'ignore' });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(url)).ok) break; } catch {} await sleep(300); }
});

test.afterAll(async () => {
  if (vite && vite.exitCode === null) { vite.kill(); await new Promise((r) => vite.once('exit', r)); }
  await new Promise((r) => server?.close(r));
  await runtime?.close();
  await budgetDb?.close();
  await chain?.stop();
});

async function enterDemo(page, code) {
  await page.goto(url + '/');
  await page.locator('#invite').fill(code);
  await page.getByRole('button', { name: /Enter with live transactions/ }).click();
}

test('expired and revoked invites are refused with a clear message and no session', async ({ page }) => {
  for (const code of [invites.revoked.code, invites.expired.code]) {
    await enterDemo(page, code);
    await expect(page.getByText('Could not start')).toBeVisible();
    await expect(page.getByText(/invalid, revoked, expired or used up/)).toBeVisible();
  }
  await page.screenshot({ path: path.join(shots, '01-invite-refused.png'), fullPage: true });
});

test('full judge journey: one admission, obligations, AI plan, demo confirmation, LOCAL receipt, reserve rejection, reload recovery', async ({ page }) => {
  test.setTimeout(240000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let sessionPosts = 0;
  page.on('request', (r) => { if (r.url() === `${base}/demo/session` && r.method() === 'POST') sessionPosts += 1; });

  // Single-session admission: a rapid double submit sends exactly one POST.
  await page.goto(url + '/');
  await page.locator('#invite').fill(invites.live.code);
  const enter = page.getByRole('button', { name: /Enter with live transactions/ });
  await enter.dblclick();
  await expect(page.getByTestId('demo-mode-banner')).toBeVisible();
  expect(sessionPosts).toBe(1);
  await page.screenshot({ path: path.join(shots, '02-demo-entered.png'), fullPage: true });

  // Treasury: record A (HIGH) and B (initially LOW, then edited to NORMAL).
  await page.goto(url + '/treasury');
  await expect(page.getByTestId('Treasury balance')).toHaveText('0.0004 ETH');
  await expect(page.getByTestId('Protected balance')).toHaveText('0.0003 ETH');
  await expect(page.getByTestId('Available to spend')).toHaveText('0.0001 ETH');
  const due = (h) => { const d = new Date(Date.now() + h * 3600000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  async function addBill(label, priority, hours) {
    await page.getByLabel('Recipient label').fill(label);
    await page.getByLabel('Approved recipient address').fill(recipient.address);
    await page.getByLabel('Amount in ETH').fill('0.0001');
    await page.getByLabel('Due date and time').fill(due(hours));
    await page.getByLabel('Priority', { exact: true }).selectOption(priority);
    await page.getByRole('button', { name: 'Add obligation' }).click();
    await expect(page.getByRole('heading', { name: `${label} · 0.0001 ETH`, exact: true })).toBeVisible();
  }
  await addBill('Payment A', 'HIGH', 1);
  await addBill('Payment B', 'LOW', 2);
  await page.locator('article', { hasText: 'Payment B · 0.0001 ETH' }).getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Priority', { exact: true }).selectOption('NORMAL');
  await page.getByRole('button', { name: 'Save obligation' }).click();
  await expect(page.locator('article', { hasText: 'Payment B · 0.0001 ETH' })).toContainText('normal priority');
  await expect(page.getByText('Payment A · 0.0001 ETH · Fits the plan')).toBeVisible();
  await expect(page.getByText('Payment B · 0.0001 ETH · Defer')).toBeVisible();
  await page.screenshot({ path: path.join(shots, '03-treasury-plan.png'), fullPage: true });

  // Reload: the demo session is restored without a new admission.
  await page.reload();
  await expect(page.getByTestId('demo-mode-banner')).toBeVisible();
  await expect(page.getByText('Payment A · 0.0001 ETH · Fits the plan')).toBeVisible();
  expect(sessionPosts).toBe(1);

  // AI plan (scripted model): reads the trusted plan, records a plan, prepares only the PAY obligation.
  script.push(
    { toolCalls: [call('generate_treasury_plan', { days: 7 })] },
    { toolCalls: [call('record_plan', { goal: 'Prepare the bill that fits', steps: [{ description: 'Prepare it', tool: 'prepare_treasury_payment' }] })] },
    (req) => {
      const plan = JSON.parse(req.messages.find((m) => m.role === 'tool' && m.results?.[0]?.name === 'generate_treasury_plan').results[0].content);
      return { toolCalls: [call('prepare_treasury_payment', { obligation_id: plan.payments.find((p) => p.recommendation === 'PAY').id })] };
    },
    { text: 'Payment A fits above your protected reserve and is ready for your confirmation. Payment B would breach the reserve.' },
  );
  await page.getByRole('link', { name: 'Prioritize my upcoming payments' }).click();
  await page.locator('form').filter({ has: page.getByPlaceholder('Ask your AI assistant…') }).locator('button[type=submit]').click();
  await expect(page.getByText(/ready for your confirmation/)).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: path.join(shots, '04-ai-plan.png'), fullPage: true });

  // Explicit demo confirmation on the payment screen → LOCAL transaction receipt.
  await page.goto(url + '/proposals');
  const review = page.getByRole('button', { name: 'Review payment' });
  if (await review.count()) await review.first().click();
  await page.getByTestId('demo-confirm-checkbox').check();
  let confirms = 0;
  page.on('request', (r) => { if (/\/confirm$/.test(r.url()) && r.method() === 'POST') confirms += 1; });
  await page.getByRole('button', { name: 'Confirm demo payment' }).click();
  await expect(page.getByTestId('demo-receipt')).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('demo-receipt')).toContainText('SIMULATED');
  await expect(page.getByTestId('demo-receipt')).toContainText('not public evidence');
  await expect(page.getByTestId('demo-receipt').getByRole('link')).toHaveCount(0);
  expect(confirms).toBe(1);
  await page.screenshot({ path: path.join(shots, '05-receipt-local.png'), fullPage: true });
  expect(await chain.provider.getBalance(contract)).toBe(W('0.0003'));

  // B: the policy check refuses it to protect the reserve; nothing is sent.
  const nonce = await chain.provider.getTransactionCount(devWallet(6).address);
  await page.goto(url + '/treasury');
  await expect(page.locator('article', { hasText: 'Payment A · 0.0001 ETH' })).toContainText('Paid — verified receipt');
  await page.getByRole('button', { name: 'Check payment policy' }).click();
  await expect(page.getByText('Payment was not authorized')).toBeVisible();
  await expect(page.locator('article', { hasText: 'Payment B · 0.0001 ETH' })).toContainText('Failed / rejected');
  expect(await chain.provider.getTransactionCount(devWallet(6).address)).toBe(nonce);
  await page.screenshot({ path: path.join(shots, '06-reserve-rejection.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('explore mode (no invite) can read the treasury but cannot record or prepare payments', async ({ page }) => {
  await page.goto(url + '/');
  await page.getByRole('button', { name: /Enter in explore mode/ }).click();
  await expect(page.getByTestId('demo-mode-banner')).toBeVisible();
  await page.goto(url + '/treasury');
  await expect(page.getByTestId('Treasury balance')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add obligation' })).toHaveCount(0);
  await expect(page.getByText(/invited demo session can add payments/)).toBeVisible();
  await page.screenshot({ path: path.join(shots, '07-explore-mode.png'), fullPage: true });
});
