#!/usr/bin/env node
/**
 * Recorded end-to-end demonstration (Deliverable 06 video + evidence).
 *
 *   node scripts/sepolia-demo.mjs --rehearse [--with-ai] [--headed]   # local Hardhat chain, throwaway keys: nothing public
 *   node scripts/sepolia-demo.mjs --execute --target sepolia-v2-full --i-approve-sepolia-v2-full-transactions [--headed]
 *                                                             # Ethereum Sepolia, contract v2; also needs CONFIRM_PUBLIC_DEPLOY=yes
 *
 * The v1 public run (target "sepolia", evidence/sepolia/) is frozen: that target refuses --execute, and a v2 run refuses
 * to start if its evidence folder already holds files or its deployment record is not a v2 contract.
 *
 * One continuous Playwright video of a single browser tab shows:
 *  - an on-screen run log (owner top-ups and contract deployment, which have no UI);
 *  - the deployment on the Blockscout explorer;
 *  - the real AgentWallet console: wallet connect, network switch, SIWE sign-in, recipient allowlist,
 *    deposit, an AI agent instruction with its plan, tool calls and draft, risk checks, owner EIP-712
 *    approval and on-chain execution, a policy rejection, the auto-approval limit, an AI-drafted
 *    scheduled payment, the owner-signed grant, autonomous execution, pause/unpause, emergency stop,
 *    withdrawal, transaction history and audit log;
 *  - each key transaction on Blockscout.
 *
 * WALLET: the console talks to a test-only EIP-1193 bridge, NOT the MetaMask extension. It signs in code
 * with the owner key from secrets/ (never typed or shown) and refuses anything except: SIWE for this
 * console on this chain, EIP-712 for this contract, and transactions to this contract with the owner
 * functions below, ≤ 0.001 ETH value. Real-MetaMask behaviour is covered separately (docs/METAMASK_DEMO.md §5).
 *
 * Output (no secrets): <out>/recordings/raw/*.webm (unedited), <out>/screenshots/*.png, <out>/timeline.json,
 * <out>/EVIDENCE.md + evidence.json, <out>/MANIFEST.json (SHA-256 of every file). Then scripts/demo-edit.mjs
 * builds <out>/recordings/agentwallet-demo.mp4 from the raw footage.
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(path.join(ROOT, 'backend', 'package.json'));
const { ethers } = req('ethers');
const dotenv = req('dotenv');
const { chromium } = createRequire(path.join(ROOT, 'frontend', 'package.json'))('@playwright/test');
const run = await import(pathToFileURL(path.join(ROOT, 'scripts', 'base-sepolia-run.mjs')).href);
const { deployGate, resetDeployGate } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'deploy-gate.mjs')).href);
const CONTRACTS_ENV = path.join(ROOT, 'contracts', '.env');
const { PLAN, TARGETS, RECIPIENT_LABEL } = run;
const E = ethers.parseEther;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BLOCKSCOUT = { 11155111: 'https://eth-sepolia.blockscout.com', 84532: 'https://base-sepolia.blockscout.com' };
const ETHERSCAN = { 11155111: 'https://sepolia.etherscan.io', 84532: 'https://sepolia.basescan.org' };
const OWNER_FUNCTIONS = ['setRecipient', 'deposit', 'revokeGrant', 'pause', 'unpause', 'emergencyStop', 'withdraw'];
const VIEW = { width: 1440, height: 900 };

// ---------------------------------------------------------------- on-screen run log
const lines = [];
function say(m) {
  const t = new Date().toISOString().slice(11, 19);
  lines.push(`${t}  ${m}`);
  console.log(`[demo] ${m}`);
}
function startLogServer() {
  const html = `<!doctype html><meta charset="utf-8"><title>AgentWallet run log</title>
<style>body{margin:0;background:#0f172a;color:#e2e8f0;font:15px/1.55 ui-monospace,Consolas,monospace}
header{padding:18px 28px;background:#1e293b;border-bottom:1px solid #334155}h1{margin:0;font:600 20px system-ui}
p{margin:4px 0 0;color:#94a3b8;font:13px system-ui}#log{padding:18px 28px;white-space:pre-wrap;word-break:break-all}
.tx{color:#86efac}</style><header><h1 id="h">AgentWallet: public-chain run</h1><p id="s"></p></header><div id="log"></div>
<script>async function tick(){try{const r=await fetch('/log.json');const j=await r.json();document.getElementById('h').textContent=j.title;
document.getElementById('s').textContent=j.subtitle;document.getElementById('log').innerHTML=j.lines.map(l=>l.replace(/&/g,'&amp;').replace(/</g,'&lt;')
.replace(/(0x[0-9a-fA-F]{64})/g,'<span class="tx">$1</span>')).join('\\n');window.scrollTo(0,document.body.scrollHeight)}catch{}}setInterval(tick,600);tick()</script>`;
  const meta = { title: 'AgentWallet: public-chain run', subtitle: '' };
  const server = http.createServer((q, res) => {
    if (q.url === '/log.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ...meta, lines })); }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(html);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${server.address().port}/`, meta, close: () => new Promise((c) => server.close(c)) })));
}

// ---------------------------------------------------------------- owner wallet bridge (test-only, restricted)
async function installBridge(page, { ownerWallet, ownerAddress, chainId, consoleHost, contract, txs }) {
  const iface = new ethers.Interface(JSON.parse(fs.readFileSync(run.ARTIFACT_PATH, 'utf8')).abi);
  const allowedSelectors = new Set(OWNER_FUNCTIONS.map((f) => iface.getFunction(f).selector));
  const READ = new Set(['eth_call', 'eth_estimateGas', 'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_blockNumber', 'eth_getBalance', 'eth_gasPrice', 'eth_feeHistory', 'eth_maxPriorityFeePerGas', 'eth_getBlockByNumber', 'eth_getCode', 'eth_getTransactionCount', 'net_version']);
  await page.exposeFunction('__ownerWallet', async ({ method, params = [] }) => {
    if (method === 'personal_sign') {
      const text = ethers.toUtf8String(params[0]);
      if (!text.startsWith(`${consoleHost} wants you to sign in`) || !text.includes(`\nChain ID: ${chainId}\n`)) throw new Error('bridge: refusing a sign-in message for another site or chain');
      return ownerWallet.signMessage(text);
    }
    if (method === 'eth_signTypedData_v4') {
      const d = JSON.parse(params[1]);
      if (Number(d.domain.chainId) !== chainId || ethers.getAddress(d.domain.verifyingContract) !== contract()) throw new Error('bridge: refusing typed data for another contract or chain');
      delete d.types.EIP712Domain;
      return ownerWallet.signTypedData(d.domain, d.types, d.message);
    }
    if (method === 'eth_sendTransaction') {
      const t = params[0];
      const value = BigInt(t.value || 0);
      if (!t.to || ethers.getAddress(t.to) !== contract()) throw new Error('bridge: owner transactions may only go to the AgentWallet contract');
      if (!allowedSelectors.has((t.data || '0x').slice(0, 10))) throw new Error('bridge: function not allowed');
      if (value > PLAN.hardCeiling) throw new Error('bridge: value above ceiling');
      const sent = await ownerWallet.sendTransaction({ to: t.to, data: t.data, value, ...(t.gas ? { gasLimit: BigInt(t.gas) } : {}) });
      const fn = iface.parseTransaction({ data: t.data, value }).name;
      txs.push({ label: `owner ${fn}`, hash: sent.hash });
      say(`Owner wallet sent ${fn}: ${sent.hash}`);
      return sent.hash;
    }
    if (READ.has(method)) return ownerWallet.provider.send(method, params);
    throw new Error(`bridge: ${method} not supported`);
  });
  await page.addInitScript(({ address, chainHex }) => {
    // Like a real wallet, remember the site connection and selected network across page reloads.
    const store = window.sessionStorage;
    let connected = store.getItem('__bridgeConnected') === '1', chainId = store.getItem('__bridgeChain') || '0x1';
    const listeners = {};
    window.ethereum = {
      isAgentWalletTestBridge: true,
      on: (n, f) => (listeners[n] ||= []).push(f),
      removeListener: (n, f) => { listeners[n] = (listeners[n] || []).filter((x) => x !== f); },
      request: async ({ method, params }) => {
        if (method === 'eth_accounts') return connected ? [address] : [];
        if (method === 'eth_requestAccounts') { connected = true; store.setItem('__bridgeConnected', '1'); return [address]; }
        if (method === 'eth_chainId') return chainId;
        if (method === 'wallet_switchEthereumChain') {
          if (params[0].chainId !== chainHex) throw Object.assign(new Error('Unrecognized chain'), { code: 4902 });
          chainId = chainHex; store.setItem('__bridgeChain', chainId); (listeners.chainChanged || []).forEach((f) => f(chainId)); return null;
        }
        if (method === 'wallet_addEthereumChain') return null;
        return window.__ownerWallet({ method, params });
      },
    };
  }, { address: ownerAddress, chainHex: `0x${chainId.toString(16)}` });
}

// ---------------------------------------------------------------- recorded steps
function recorder(page, outDir) {
  const t0 = Date.now();
  const timeline = [];
  let shot = 0;
  return {
    timeline,
    async step(id, title, fn, { keep } = {}) {
      const entry = { id, title, start: (Date.now() - t0) / 1000, keep: keep || null };
      say(`▶ ${title}`);
      try {
        await fn();
      } finally {
        entry.end = (Date.now() - t0) / 1000;
        entry.screenshot = `screenshots/${String(++shot).padStart(2, '0')}-${id}.png`;
        await page.screenshot({ path: path.join(outDir, entry.screenshot) }).catch(() => {});
        timeline.push(entry);
      }
    },
    mark: () => (Date.now() - t0) / 1000,
  };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = http.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }).on('error', reject);
  });
}

async function waitForApi(fn, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await sleep(2000);
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const rehearse = args.has('--rehearse');
  const argv = process.argv.slice(2);
  const targetName = argv.includes('--target') ? argv[argv.indexOf('--target') + 1] : 'sepolia-v2-full';
  if (!rehearse && !args.has('--execute')) throw new Error(`Pass --rehearse or --execute --target ${targetName} --i-approve-${targetName}-transactions`);
  // Checked before any folder is created or anything is read from the chain: frozen v1 target, protected v1 paths,
  // a non-empty evidence folder and a compiled-contract version mismatch all stop here.
  const target = rehearse ? TARGETS[targetName] : run.assertTargetSafe(targetName, { artifactVersion: run.artifactVersion() });
  if (!target) throw new Error(`Unknown --target ${targetName}`);
  const expectVersion = target.contractVersion || run.artifactVersion();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = rehearse ? path.join(ROOT, 'evidence', 'rehearsal', stamp) : path.join(ROOT, target.evidence);
  for (const d of ['screenshots', 'recordings/raw']) fs.mkdirSync(path.join(outDir, d), { recursive: true });
  const cleanup = [];
  const txs = [];
  let closeGate = null;
  let chainId, rpcUrl, keys, profile, apiPort, appPort, dbDir, deploymentFile, llm, chain;
  try {
    // ---------------- environment
    if (rehearse) {
      const { startTestChain, devWallet } = await import(pathToFileURL(path.join(ROOT, 'backend', 'test', 'helpers', 'chain.js')).href);
      chain = await startTestChain();
      cleanup.push(() => chain.stop());
      await chain.send('hardhat_setNextBlockBaseFeePerGas', ['0x5b8d80']);
      await chain.send('hardhat_mine', ['0x1']);
      chainId = 31337; rpcUrl = chain.rpcUrl;
      keys = { deployer: ethers.Wallet.createRandom(), agent: ethers.Wallet.createRandom(), owner: ethers.Wallet.createRandom(), recipient: ethers.Wallet.createRandom() };
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-demo-'));
      [apiPort, appPort] = [await freePort(), await freePort()];
      profile = path.join(tmp, '.env.rehearsal');
      fs.writeFileSync(profile, [`APP_ORIGIN=http://localhost:${appPort}`, `CORS_ORIGINS=http://localhost:${appPort}`, 'DATABASE_URL=', `AGENT_PRIVATE_KEY=${keys.agent.privateKey}`, 'NATIVE_RESERVE_FLOOR_ETH=0.0001', 'MIN_EXECUTOR_GAS_BALANCE_ETH=0.0002', 'MAX_FEE_PER_GAS_GWEI=5', 'PROPOSAL_TTL_SECONDS=600', 'RL_SERVICE_URL=http://127.0.0.1:9'].join('\n') + '\n', { mode: 0o600 });
      dbDir = path.join(tmp, 'db'); deploymentFile = path.join(tmp, 'deployment.json');
      const need = await run.budget(chain.provider, keys);
      await (await devWallet(0, chain.provider).sendTransaction({ to: keys.owner.address, value: need.totalToFundOwner + E('0.0005') })).wait();
      if (args.has('--with-ai')) llm = run.llmFromBackendEnv();
      else {
        const { startStubOpenAi } = await import(pathToFileURL(path.join(ROOT, 'backend', 'test', 'helpers', 'stubOpenAi.js')).href);
        const stub = await startStubOpenAi();
        cleanup.push(() => stub.close());
        llm = stub.llmEnv;
      }
    } else {
      const gate = deployGate(CONTRACTS_ENV);
      // From here on, the gate is closed again however the run ends (success, error or Ctrl+C), and FIRST:
      // before any other cleanup step that could hang.
      closeGate = () => say(`Deployment gate reset: CONFIRM_PUBLIC_DEPLOY=${resetDeployGate(CONTRACTS_ENV)}`);
      for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { resetDeployGate(CONTRACTS_ENV); process.exit(130); });
      if (!args.has(`--i-approve-${targetName}-transactions`) || gate !== 'yes') {
        throw new Error(`Refusing to execute: pass --i-approve-${targetName}-transactions AND set CONFIRM_PUBLIC_DEPLOY=yes in contracts/.env`);
      }
      ({ keys } = run.readKeys(target));
      chainId = target.chainId; rpcUrl = target.rpc;
      profile = path.join(ROOT, target.profile); apiPort = target.apiPort; appPort = 5175;
      dbDir = path.join(ROOT, target.db); deploymentFile = path.join(ROOT, target.deployment);
      llm = run.llmFromBackendEnv();
      if (!llm.LLM_PROVIDER) throw new Error('backend/.env has no LLM_*; the recorded demo needs the AI agent');
    }
    run.checkRoles(keys);
    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
    cleanup.push(() => provider.destroy());
    if (Number(await provider.send('eth_chainId', [])) !== chainId) throw new Error(`RPC is not chain ${chainId}`);
    const w = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v.connect(provider)]));
    const ownerNM = new ethers.NonceManager(w.owner);
    const need = await run.budget(provider, keys);
    if ((await provider.getBalance(keys.owner.address)) < need.totalToFundOwner) throw new Error('Owner balance below the computed budget');
    const confirmations = rehearse ? 1 : 2;
    const explorer = rehearse ? null : BLOCKSCOUT[chainId];
    const consoleUrl = `http://localhost:${appPort}`;

    // ---------------- recording
    const log = await startLogServer();
    cleanup.push(() => log.close());
    log.meta.title = rehearse ? `AgentWallet v${expectVersion}: recording rehearsal (local chain, nothing public)` : `AgentWallet v${expectVersion}: ${target.name} (chain ${chainId}) public run`;
    log.meta.subtitle = `Owner ${keys.owner.address} · Agent ${keys.agent.address} · Recipient ${keys.recipient.address}`;
    run.setLogger((m) => say(m));
    const browser = await chromium.launch({ headless: !args.has('--headed') });
    cleanup.push(() => browser.close());
    const context = await browser.newContext({ viewport: VIEW, recordVideo: { dir: path.join(outDir, 'recordings', 'raw'), size: VIEW } });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const rec = recorder(page, outDir);
    let contractAddress = null;
    await installBridge(page, { ownerWallet: ownerNM, ownerAddress: keys.owner.address, chainId, consoleHost: `localhost:${appPort}`, contract: () => contractAddress, txs });
    const nav = (href) => page.locator(`a[href="${href}"]`).first().click();
    const showExplorer = async (kind, value) => {
      if (!explorer) return;
      await page.goto(`${explorer}/${kind}/${value}`, { waitUntil: 'domcontentloaded' });
      await page.getByText(kind === 'tx' ? /Success/ : /Contract|Transactions/).first().waitFor({ timeout: 45000 }).catch(() => {});
      await sleep(3500);
    };

    // 1–2. Funding and deployment (script; shown in the on-screen log, then on the explorer).
    await rec.step('deploy', 'Owner tops up deployer and agent; deployer deploys AgentWallet', async () => {
      await page.goto(log.url);
      say(`Chain ${chainId} · owner balance ${ethers.formatEther(await provider.getBalance(keys.owner.address))} ETH · budget ${ethers.formatEther(need.totalToFundOwner)} ETH`);
      const steps = [];
      const record = await run.topUpAndDeploy({ provider, keys, w, owner: ownerNM, need, allowed: new Set(Object.values(keys).map((k) => k.address)), deploymentFile, chainId, confirmations, steps, expectVersion });
      contractAddress = ethers.getAddress(record.contractAddress);
      for (const s of steps) txs.push({ label: s.step, hash: s.tx });
      say(`AgentWallet contract: ${contractAddress} (caps ${ethers.formatEther(PLAN.perTxCap)} ETH/tx, ${ethers.formatEther(PLAN.dailyCap)} ETH/day)`);
      await sleep(3000);
    }, { keep: 'end' });
    const deployTx = txs.find((t) => t.label === 'deploy')?.hash;
    await rec.step('explorer-deploy', 'Deployment on the public block explorer', async () => {
      if (!explorer) { await page.goto('https://eth-sepolia.blockscout.com/tx/0x6a4c2921ebbe0f0ed32b7f5e2a9eb32b0d463944c44af65de5fdbe43be19b012', { waitUntil: 'domcontentloaded' }); await sleep(4000); return; }
      if (deployTx) await showExplorer('tx', deployTx);
      await showExplorer('address', contractAddress);
    });

    // Backend (separate profile) + console.
    const backend = await run.startBackend({ profile, apiPort, dbDir, deploymentFile, rpcUrl, chainId, schedulerTickMs: rehearse ? 1000 : undefined, llm });
    cleanup.unshift(() => backend.stop());
    const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', 'localhost', '--port', String(appPort), '--strictPort'], { cwd: path.join(ROOT, 'frontend'), env: { ...process.env, VITE_API_URL: `http://localhost:${apiPort}/api` }, stdio: 'ignore' });
    cleanup.unshift(() => { if (vite.exitCode === null) vite.kill(); });
    await waitForApi(async () => { try { return (await fetch(consoleUrl)).ok; } catch { return false; } }, 60000, 'console');
    const api = backend.api;
    const { message } = await api('POST', '/auth/nonce', { address: keys.owner.address });
    api.token = (await api('POST', '/auth/verify', { message, signature: await keys.owner.signMessage(message) })).token;

    await rec.step('connect', 'Wallet connection, network check and SIWE sign-in', async () => {
      await page.goto(consoleUrl);
      await page.getByRole('button', { name: 'Connect wallet' }).click();
      await page.getByRole('button', { name: 'Switch network' }).click();
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.getByText('owner', { exact: true }).first().waitFor();
      await sleep(2500);
    });
    await rec.step('allowlist', 'Owner allowlists the recipient on-chain', async () => {
      await nav('/controls');
      await page.getByPlaceholder('0x… recipient').fill(keys.recipient.address);
      await page.getByPlaceholder('Label').fill(RECIPIENT_LABEL);
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await page.getByText(/confirmed in block/).first().waitFor({ timeout: 180000 });
      await sleep(2000);
    }, { keep: 'ends' });
    await rec.step('deposit', `Owner deposits ${ethers.formatEther(PLAN.deposit)} ETH into the wallet`, async () => {
      await nav('/treasury');
      await page.getByPlaceholder('Amount').first().fill(ethers.formatEther(PLAN.deposit));
      await page.getByRole('button', { name: 'Deposit' }).click();
      await page.getByText(/confirmed in block/).first().waitFor({ timeout: 180000 });
      await sleep(2000);
    }, { keep: 'ends' });

    const ask = async (text, type) => {
      await nav('/agent');
      await page.getByPlaceholder('Ask the agent…').fill(text);
      const resp = page.waitForResponse((r) => r.url().endsWith('/api/agent/chat') && r.request().method() === 'POST', { timeout: 180000 });
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      const turn = (await (await resp).json()).data;
      await page.getByText('Resulting actions').last().waitFor();
      await page.getByText(text).last().scrollIntoViewIfNeeded(); // instruction, plan and reply first
      await sleep(3500);
      const tools = page.locator('button:has(span.font-mono)');
      const n = await tools.count();
      for (let i = Math.max(0, n - 3); i < n; i++) await tools.nth(i).click().catch(() => {}); // expand this turn's tool calls
      await tools.nth(Math.max(0, n - 3)).scrollIntoViewIfNeeded().catch(() => {});
      await sleep(4000);
      await page.getByText('Resulting actions').last().scrollIntoViewIfNeeded();
      await sleep(2000);
      const action = (turn.actions || []).find((a) => a.type === type);
      if (turn.status !== 'COMPLETED' || !action) throw new Error(`AI agent turn ${turn.status} without a ${type}: ${String(turn.text || turn.error).slice(0, 200)}`);
      return { turn, action };
    };

    let p1;
    await rec.step('ai-transfer', 'AI agent receives an instruction, plans and drafts a transfer', async () => {
      const { action } = await ask(`Send ${PLAN.approvedTransfer} ETH to my approved recipient "${RECIPIENT_LABEL}".`, 'proposal');
      p1 = await api('GET', `/proposals/${action.id}`);
    });
    await rec.step('approve', 'Risk checks pass; owner reviews and signs the exact transfer (EIP-712); agent key executes', async () => {
      run.checkDraft('transfer', { status: p1.status, token: p1.token.address, recipient: p1.recipient, amountWei: p1.amountWei }, { status: 'AWAITING_APPROVAL', token: ethers.ZeroAddress, recipient: keys.recipient.address, amountWei: E(PLAN.approvedTransfer).toString() });
      await nav('/proposals');
      await page.getByRole('button', { name: 'Approve & sign' }).first().click();
      await page.getByText('Execution: CONFIRMED').first().waitFor({ timeout: 240000 });
      const done = await api('GET', `/proposals/${p1.id}`);
      txs.push({ label: 'owner-approved transfer (AI-drafted)', hash: done.execution.txHash });
      say(`Owner-approved transfer executed: ${done.execution.txHash}`);
      await sleep(3000);
    }, { keep: 'ends' });
    await rec.step('ai-rejection', 'AI agent drafts an over-cap transfer; the policy engine rejects it (nothing sent)', async () => {
      const { action } = await ask(`Send ${PLAN.rejectedTransfer} ETH to my approved recipient "${RECIPIENT_LABEL}".`, 'proposal');
      const p2 = await api('GET', `/proposals/${action.id}`);
      if (p2.status !== 'POLICY_REJECTED') throw new Error(`Over-cap draft was ${p2.status}`);
      say(`Policy rejected the over-cap draft: ${p2.policyResult.violations.map((v) => v.id).join(', ')}`);
      await nav('/proposals');
      await sleep(3500);
    });
    await rec.step('auto-limit', `Owner sets the auto-approval limit to ${PLAN.autonomousTransfer} ETH`, async () => {
      await nav('/controls');
      await page.locator('tr', { has: page.locator('td', { hasText: /^ETH$/ }) }).locator('td').nth(2).locator('input').fill(PLAN.autonomousTransfer);
      await page.getByRole('button', { name: 'Save policy' }).click();
      await page.getByRole('button', { name: 'I understand, apply it' }).click();
      await waitForApi(async () => (await api('GET', '/policy')).autoApprovalMaxPerTx?.[ethers.ZeroAddress] === E(PLAN.autonomousTransfer).toString(), 30000, 'policy');
      await sleep(2000);
    });
    let task;
    await rec.step('ai-schedule', 'AI agent drafts a scheduled payment', async () => {
      const at = new Date(Date.now() + (rehearse ? 75 : 150) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const { action } = await ask(`Schedule a one-time payment of ${PLAN.autonomousTransfer} ETH to my approved recipient "${RECIPIENT_LABEL}" at ${at}, valid for 1 day.`, 'task');
      task = await api('GET', `/tasks/${action.id}`);
      run.checkDraft('scheduled payment', { status: task.status, token: task.token.address, recipient: task.recipient, amountWei: task.amountWei, schedule: task.schedule.type, runs: task.maxRuns ?? 1 }, { status: 'PENDING_AUTHORIZATION', token: ethers.ZeroAddress, recipient: keys.recipient.address, amountWei: E(PLAN.autonomousTransfer).toString(), schedule: 'once', runs: 1 });
    });
    await rec.step('grant', 'Owner signs the bounded task grant; the scheduler executes autonomously', async () => {
      await nav('/automation');
      await page.getByRole('button', { name: 'Sign grant' }).first().click();
      await waitForApi(async () => (await api('GET', `/tasks/${task.id}`)).status === 'ACTIVE', 60000, 'grant');
      const runRow = await waitForApi(async () => { const t = await api('GET', `/tasks/${task.id}`); const r = t.runs?.[0]; return r && ['CONFIRMED', 'FAILED', 'ESCALATED'].includes(r.status) ? r : null; }, 420000, 'autonomous run');
      if (runRow.status !== 'CONFIRMED') throw new Error(`Autonomous run ${runRow.status}`);
      const p3 = await api('GET', `/proposals/${runRow.proposalId}`);
      if (p3.approvalKind !== 'TASK_GRANT') throw new Error('Autonomous run was not grant-approved');
      txs.push({ label: 'autonomous transfer (AI-drafted task, grant-approved)', hash: p3.execution.txHash });
      say(`Autonomous transfer executed under the grant: ${p3.execution.txHash}`);
      await page.reload();
      await page.getByRole('button', { name: 'Runs' }).first().click().catch(() => {});
      await sleep(3500);
    }, { keep: 'ends' });
    if (expectVersion >= 2) await rec.step('revoke', 'Owner signs a second, recurring grant, then revokes it ON-CHAIN; the agent key can no longer use it', async () => {
      await nav('/automation');
      // Weekly, three days out: the grant can never come due during the run, so no extra transfer can happen.
      await page.getByLabel('Recipient (allowlisted)').selectOption(keys.recipient.address);
      await page.getByLabel('Amount per run').fill(PLAN.autonomousTransfer);
      await page.getByPlaceholder('Title (optional)').fill('Recurring grant to revoke');
      await page.getByLabel('Schedule').selectOption('weekly');
      await page.getByLabel('Weekday').selectOption(String((new Date().getUTCDay() + 3) % 7));
      await page.getByRole('button', { name: 'Create task', exact: false }).click();
      const card = page.getByText('Recurring grant to revoke', { exact: true }).locator('xpath=ancestor::div[contains(@class,"space-y-3")][1]');
      await card.getByRole('button', { name: 'Sign grant' }).click();
      await card.getByRole('button', { name: 'Revoke grant on-chain' }).click();
      await card.getByText(/^Grant revoked on-chain: the contract will refuse every remaining run/).waitFor({ timeout: 240000 });
      const t = (await api('GET', '/tasks')).find((x) => x.title === 'Recurring grant to revoke');
      const v2 = new ethers.Contract(contractAddress, JSON.parse(fs.readFileSync(run.ARTIFACT_PATH, 'utf8')).abi, provider);
      if (!(await v2.grantRevoked(t.grantDigest))) throw new Error('grantRevoked is false after the revocation transaction');
      let probe = 'ACCEPTED';
      try { await v2.executeGrantTransfer.staticCall(t.grantTypedData.message, t.grantSignature, ethers.id(`probe:${t.id}`), { from: keys.agent.address }); } catch (err) { try { probe = v2.interface.parseError(err.data)?.name || 'reverted'; } catch { probe = 'reverted'; } }
      if (probe !== 'GrantIsRevoked') throw new Error(`Agent probe of the revoked grant returned ${probe}`);
      say(`Grant ${t.grantDigest.slice(0, 10)}… revoked on-chain; agent eth_call probe → ${probe} (nothing sent)`);
      await sleep(3000);
    }, { keep: 'ends' });
    await rec.step('controls', 'Security controls: pause, unpause, emergency stop', async () => {
      await nav('/controls');
      for (const [name, button] of [['Pause contract', /^Pause contract$/], ['Unpause contract', /^Unpause contract$/], ['Emergency stop', /^Emergency stop/]]) {
        await page.getByRole('button', { name: button }).click();
        await page.getByText(new RegExp(`${name}: confirmed in block`)).first().waitFor({ timeout: 180000 });
        await sleep(1500);
      }
    }, { keep: 'ends' });
    await rec.step('withdraw', 'Owner withdraws the remaining balance', async () => {
      const left = await provider.getBalance(contractAddress);
      await nav('/treasury');
      await page.getByPlaceholder('Amount').nth(1).fill(ethers.formatEther(left));
      await page.getByPlaceholder('Destination 0x…').fill(keys.owner.address);
      await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
      await page.getByText(/Withdraw .*confirmed in block/).first().waitFor({ timeout: 180000 });
      await sleep(2000);
    }, { keep: 'ends' });
    await rec.step('history', 'Transaction history and hash-chained audit log', async () => {
      await nav('/transactions');
      await sleep(4000);
      await nav('/audit');
      await page.getByText(/Chain valid/).first().waitFor({ timeout: 30000 });
      await sleep(3500);
    });
    await rec.step('explorer-txs', 'Agent transfers and emergency stop on the public explorer', async () => {
      if (!explorer) return;
      for (const t of txs.filter((x) => /transfer|revokeGrant|emergencyStop/.test(x.label))) await showExplorer('tx', t.hash);
    });

    if (closeGate) { closeGate(); closeGate = null; } // no public transaction follows: close the gate now
    await context.close(); // finalizes the video
    const rawFile = fs.readdirSync(path.join(outDir, 'recordings', 'raw')).find((f) => f.endsWith('.webm'));
    const raw = path.join(outDir, 'recordings', 'raw', `agentwallet-${rehearse ? 'rehearsal' : 'sepolia'}-raw.webm`);
    fs.renameSync(path.join(outDir, 'recordings', 'raw', rawFile), raw);
    await backend.stop();

    // Evidence (read-only) and manifest.
    const { collectEvidence } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'collect-evidence.mjs')).href);
    const evidence = await collectEvidence({ deployment: deploymentFile, rpc: rpcUrl, db: dbDir, out: outDir });
    fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify({ video: path.relative(outDir, raw), chainId, contractVersion: expectVersion, target: targetName, rehearsal: rehearse, wallet: 'test-only EIP-1193 bridge (not MetaMask)', steps: rec.timeline, transactions: txs.map((t) => ({ ...t, blockscout: BLOCKSCOUT[chainId] ? `${BLOCKSCOUT[chainId]}/tx/${t.hash}` : null, etherscan: ETHERSCAN[chainId] ? `${ETHERSCAN[chainId]}/tx/${t.hash}` : null })) }, null, 2));
    fs.writeFileSync(path.join(outDir, 'run-log.txt'), lines.join('\n') + '\n');
    await browser.close(); // the editor renders title cards with its own browser
    try {
      const { buildDemo } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'demo-edit.mjs')).href);
      await buildDemo(outDir);
    } catch (err) {
      say(`Polished cut failed (${err.message}); the raw recording and evidence are intact. Re-run: node scripts/demo-edit.mjs ${outDir}`);
    }
    secretScan(outDir, [...Object.values(keys).map((k) => k.privateKey), llm.LLM_API_KEY].filter(Boolean));
    writeManifest(outDir);
    say(`Done: ${evidence.summary.transactions} contract txs, ${evidence.summary.autonomous} autonomous + ${evidence.summary.ownerApproved} owner-approved, checks ${evidence.summary.allTransfersPassedOnChainChecks ? 'passed' : 'FAILED'}. Output: ${outDir}`);
    return { outDir, evidence };
  } finally {
    if (closeGate) closeGate();
    // Each cleanup step is bounded, so a stuck child process can never keep the run alive.
    for (const c of cleanup) await Promise.race([Promise.resolve().then(c).catch(() => {}), sleep(15000)]);
  }
}

/** Fails the run if any private key or API key ended up in any text output (logs, JSON, Markdown, HTML). */
function secretScan(outDir, secrets) {
  const needles = secrets.map((s) => s.replace(/^0x/, '').toLowerCase()).filter((s) => s.length >= 16);
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(json|md|txt|html|log)$/i.test(f.name)) { const t = fs.readFileSync(p, 'utf8').toLowerCase(); if (needles.some((n) => t.includes(n))) hits.push(path.relative(outDir, p)); } } };
  walk(outDir);
  if (hits.length) throw new Error(`SECRET FOUND in evidence output: ${hits.join(', ')}. Do not share this folder.`);
  say(`Secret scan: no private key or API key in ${outDir} text outputs`);
}

function writeManifest(outDir) {
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); f.isDirectory() ? walk(p) : files.push(p); } };
  walk(outDir);
  const entries = files.filter((f) => !f.endsWith('MANIFEST.json')).map((f) => ({ file: path.relative(outDir, f).replace(/\\/g, '/'), bytes: fs.statSync(f).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') }));
  fs.writeFileSync(path.join(outDir, 'MANIFEST.json'), JSON.stringify({ generatedAt: new Date().toISOString(), files: entries }, null, 2));
}

main().then(() => process.exit(0), (err) => {
  console.error(`[demo] ${err.stack || err.message}`);
  process.exit(1);
});
