// LOCAL v2 SHOWCASE (real provider, real local chain, recorded). Opt-in, uses a paid LLM API (a few gpt-4.1-mini calls):
//   cd frontend && LIVE_LLM=1 npx playwright test v2.showcase.live.spec.js
// Everything here runs on a LOCAL Hardhat chain (31337) against contract v2, which is NOT deployed publicly. Every
// screen carries a fixed "LOCAL HARDHAT" badge so the recording cannot be mistaken for the public Sepolia (v1) run.
// Wallet: the same test-only EIP-1193 bridge as wallet.spec.js, holding the PUBLIC Hardhat dev key #0 (not MetaMask).
// The spawned backend reads LLM_* from backend/.env itself; this spec never reads or prints the key.
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import { startTestChain, deployFixture, devWallet, v1Artifact } from '../../../backend/test/helpers/chain.js';

test.skip(process.env.LIVE_LLM !== '1', 'set LIVE_LLM=1 to run (uses a paid API)');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const V2_ABI = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'abi', 'AgentWallet.json'), 'utf8')).abi;
const OUT = process.env.SHOWCASE_OUT || path.join(root, 'frontend', 'test-results', 'v2-showcase');
let chain, fixture, base, url, dir, v2, asAgent;
const processes = [];
const owner = devWallet(0);
const evidence = { label: 'LOCAL HARDHAT (chain 31337), contract v2, not deployed publicly', startedAt: new Date().toISOString(), steps: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

test.beforeAll(async () => {
  test.setTimeout(180000);
  fs.mkdirSync(OUT, { recursive: true });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-showcase-'));
  chain = await startTestChain();
  fixture = await deployFixture(chain.provider);
  fs.writeFileSync(path.join(dir, 'deployment.json'), JSON.stringify(fixture.deployment));
  v2 = new ethers.Contract(fixture.deployment.contractAddress, V2_ABI, chain.provider);
  asAgent = v2.connect(devWallet(1, chain.provider));
  const apiPort = 36000 + Math.floor(Math.random() * 1000);
  const webPort = apiPort + 1000;
  base = `http://127.0.0.1:${apiPort}/api`;
  url = `http://127.0.0.1:${webPort}`;
  await serve(['src/server.js'], path.join(root, 'backend'), {
    NODE_ENV: 'test', PORT: String(apiPort), HOST: '127.0.0.1', CHAIN_ID: '31337', RPC_URL: chain.rpcUrl,
    DEPLOYMENT_FILE: path.join(dir, 'deployment.json'), PGLITE_DIR: path.join(dir, 'pglite'), DATABASE_URL: '',
    LOCAL_DEV_AGENT_INDEX: '1', AGENT_PRIVATE_KEY: '', RL_SERVICE_URL: 'http://127.0.0.1:9', CORS_ORIGINS: url,
    INDEXER_POLL_MS: '300', SCHEDULER_TICK_MS: '500', PROPOSAL_TTL_SECONDS: '600', LLM_TIMEOUT_MS: '60000', LOG_LEVEL: 'warn',
  }, `${base}/config`);
  await serve(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], path.join(root, 'frontend'), { VITE_API_URL: base }, url);
});

test.afterAll(async () => {
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'showcase-evidence.json'), JSON.stringify(evidence, null, 2));
  for (const child of processes.reverse()) { if (child.exitCode === null) { child.kill(); await new Promise((r) => child.once('exit', r)); } }
  await chain?.stop();
});

async function wallet(page) {
  await page.exposeFunction('__localWallet', async ({ method, params = [] }) => {
    if (method === 'personal_sign') return owner.signMessage(ethers.getBytes(params[0]));
    if (method === 'eth_signTypedData_v4') { const d = JSON.parse(params[1]); delete d.types.EIP712Domain; return owner.signTypedData(d.domain, d.types, d.message); }
    return chain.send(method, params);
  });
  await page.addInitScript(({ address }) => {
    // Permanent on-screen label plus a caption that survives reloads (kept in sessionStorage).
    const draw = () => {
      if (!document.body) return;
      let badge = document.getElementById('__aw_local_badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = '__aw_local_badge';
        badge.style.cssText = 'position:fixed;z-index:2147483647;right:12px;bottom:12px;max-width:560px;background:#111;color:#fff;font:12px/1.45 ui-monospace,monospace;padding:10px 12px;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.35);white-space:pre-wrap;pointer-events:none';
        document.body.appendChild(badge);
      }
      const caption = sessionStorage.getItem('__aw_caption') || '';
      badge.textContent = `LOCAL HARDHAT · chain 31337 · AgentWallet v2 (not deployed publicly)\nNot the public Sepolia run · test wallet bridge, public Hardhat key #0${caption ? `\n\n${caption}` : ''}`;
    };
    window.__awCaption = (text) => { sessionStorage.setItem('__aw_caption', text); draw(); };
    document.addEventListener('DOMContentLoaded', draw);
    setInterval(draw, 500);
    let connected = false, chainId = '0x1';
    const listeners = {};
    window.ethereum = {
      on: (n, f) => (listeners[n] ||= []).push(f),
      removeListener: (n, f) => { listeners[n] = (listeners[n] || []).filter((x) => x !== f); },
      request: async ({ method, params }) => {
        if (method === 'eth_accounts') return connected ? [address] : [];
        if (method === 'eth_requestAccounts') { connected = true; return [address]; }
        if (method === 'eth_chainId') return chainId;
        if (method === 'wallet_switchEthereumChain') { chainId = params[0].chainId; (listeners.chainChanged || []).forEach((f) => f(chainId)); return null; }
        return window.__localWallet({ method, params });
      },
    };
  }, { address: owner.address });
}

const caption = (page, text) => page.evaluate((t) => window.__awCaption(t), text);
const step = (name, data) => {
  evidence.steps.push({ step: name, at: new Date().toISOString(), ...data });
  fs.writeFileSync(path.join(OUT, 'showcase-evidence.json'), JSON.stringify(evidence, null, 2)); // written as it goes
};
async function signIn(page, pathname) {
  await wallet(page);
  await page.goto(url + pathname);
  await page.getByRole('button', { name: 'Connect wallet', exact: false }).click();
  await page.getByRole('button', { name: 'Switch network', exact: false }).click();
  await page.getByRole('button', { name: 'Sign in', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Operator sign-in' })).toHaveCount(0);
}
const session = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('aw.session')).token);
async function api(page, method, p, body) {
  const res = await fetch(`${base}${p}`, { method, headers: { Authorization: `Bearer ${await session(page)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return (await res.json()).data;
}
async function ask(page, message) {
  const response = page.waitForResponse((r) => r.url() === `${base}/agent/chat` && r.request().method() === 'POST', { timeout: 90000 });
  await page.getByPlaceholder('Ask the agent…').fill(message);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const res = await response;
  expect(res.status()).toBe(200);
  return (await res.json()).data;
}
const methodOf = async (hash) => v2.interface.parseTransaction({ data: (await chain.provider.getTransaction(hash)).data }).name;
/** Runs an attack as a static call first (to decode the revert), then confirms no transaction was sent. */
async function attack(label, fn) {
  const nonce = await chain.provider.getTransactionCount(await asAgent.runner.getAddress());
  let error = null;
  try {
    await fn(); // resolving means the contract ACCEPTED it: not blocked
  } catch (err) {
    let name = null;
    try { name = v2.interface.parseError(err.data || err.info?.error?.data)?.name || null; } catch {}
    error = name || ((err.data === '0x' || /missing revert data/.test(err.shortMessage || '')) ? 'reverted (no such function)' : (err.shortMessage || err.message).slice(0, 80));
  }
  const sent = (await chain.provider.getTransactionCount(await asAgent.runner.getAddress())) !== nonce;
  const outcome = { attack: label, blocked: Boolean(error) && !sent, error };
  step('attack', outcome);
  return outcome;
}
const until = async (fn, ms = 120000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out'); await sleep(500); } };

test('LOCAL v2 showcase: AI drafting, owner approval, autonomous grant run, on-chain revocation and blocked attacks', async ({ page }) => {
  test.setTimeout(900000);
  expect(Number(await v2.VERSION())).toBe(2);
  await signIn(page, '/agent');

  // 1. AI interaction (real gpt-4.1-mini).
  await caption(page, '1 · AI interaction: the owner asks gpt-4.1-mini (real API) to pay the supplier.\nThe AI can only draft; it cannot sign or approve.');
  const t1 = await ask(page, 'Send 0.001 ETH to my approved supplier.');
  const prop = t1.actions.find((a) => a.type === 'proposal');
  expect(prop?.status).toBe('AWAITING_APPROVAL');
  await expect(page.getByText(`Proposal ${prop.id.slice(0, 8)} · AWAITING_APPROVAL`)).toBeVisible();
  step('ai-draft-transfer', { proposalId: prop.id, tools: t1.plan?.steps?.map((s) => s.tool) || null, status: t1.status });
  await sleep(2500);

  // 2. Owner approval with a signed execution deadline; v2 verifies the signature on-chain.
  await page.locator('a[href="/proposals"]').first().click();
  await caption(page, '2 · Owner approval: EIP-712 signature over this exact transfer and its execution deadline.\nOn v2 the CONTRACT verifies the signature (executeApprovedTransfer).');
  await expect(page.getByTestId('signed-deadline').first()).toBeVisible();
  await sleep(2500);
  await page.getByRole('button', { name: 'Approve & sign' }).first().click();
  const approved = await until(async () => { const p = await api(page, 'GET', `/proposals/${prop.id}`); return p.status === 'CONFIRMED' ? p : null; });
  await expect(page.getByText('Execution: CONFIRMED').first()).toBeVisible();
  const approvedMethod = await methodOf(approved.execution.txHash);
  expect(approvedMethod).toBe('executeApprovedTransfer');
  step('owner-approved-transfer', { proposalId: prop.id, txHash: approved.execution.txHash, block: approved.execution.blockNumber, method: approvedMethod, network: 'local hardhat 31337' });
  await sleep(2500);

  // 3. Autonomous execution under a signed, bounded grant.
  await api(page, 'PUT', '/policy', { autoApprovalMaxPerTx: { [ethers.ZeroAddress]: ethers.parseEther('0.002').toString() }, confirmLoosening: true });
  await page.locator('a[href="/agent"]').first().click();
  const at = new Date(Date.now() + 45000).toISOString().replace(/\.\d+Z$/, 'Z');
  await caption(page, `3 · Autonomy: the AI drafts a one-time payment for ${at}.\nThe owner signs one bounded grant; the run then executes with no further signature,\nwithin the owner's auto-approval limit (0.002 ETH, set in the console).`);
  const t2 = await ask(page, `Schedule a one-time payment of 0.001 ETH to my approved supplier at ${at}, valid for 1 day.`);
  const draftTask = t2.actions.find((a) => a.type === 'task');
  expect(draftTask?.status).toBe('PENDING_AUTHORIZATION');
  step('ai-draft-task', { taskId: draftTask.id, status: t2.status });
  await page.locator('a[href="/automation"]').first().click();
  await page.getByRole('button', { name: 'Sign grant', exact: false }).first().click();
  const run = await until(async () => { const t = await api(page, 'GET', `/tasks/${draftTask.id}`); return t.runs?.[0]?.status === 'CONFIRMED' ? t : null; }, 180000);
  const runProposal = await api(page, 'GET', `/proposals/${run.runs[0].proposalId}`);
  const grantMethod = await methodOf(runProposal.execution.txHash);
  expect(grantMethod).toBe('executeGrantTransfer');
  expect(runProposal.approvalKind).toBe('TASK_GRANT');
  step('autonomous-grant-run', { taskId: draftTask.id, txHash: runProposal.execution.txHash, block: runProposal.execution.blockNumber, method: grantMethod, onChainGrant: run.onChainGrant, network: 'local hardhat 31337' });
  // In-app navigation, not a reload: the test wallet bridge (like a wallet's site connection) is per page load.
  await page.locator('a[href="/proposals"]').first().click();
  await page.locator('a[href="/automation"]').first().click();
  await caption(page, `3 · Autonomous run CONFIRMED via executeGrantTransfer (no per-transfer signature).\nThe contract counted it against the signed grant: ${run.onChainGrant?.runs ?? '?'} of ${run.maxRuns ?? '?'} runs used.`);
  await sleep(4000);

  // 4. Compromised agent key: every unauthorized path is refused by the CONTRACT.
  const v1 = new ethers.Interface(v1Artifact().abi);
  const td = { proposalId: prop.id, intentId: approved.intentId, token: ethers.ZeroAddress, recipient: approved.recipient, amount: approved.amountWei, deadline: String(approved.expiresAt) };
  const results = [];
  results.push(await attack('agent key, no owner signature (v1-style executeTransfer)', () => asAgent.runner.call({ to: fixture.deployment.contractAddress, data: v1.encodeFunctionData('executeTransfer', [ethers.id('steal'), ethers.ZeroAddress, fixture.payeeA.address, ethers.parseEther('0.01')]) })));
  results.push(await attack('replay the already-executed owner approval', () => asAgent.executeApprovedTransfer.staticCall(td, approved.approvalSignature)));
  results.push(await attack('reuse the owner signature with a larger amount', () => asAgent.executeApprovedTransfer.staticCall({ ...td, intentId: ethers.id('new'), amount: ethers.parseEther('0.01').toString() }, approved.approvalSignature)));
  results.push(await attack('agent signs its own approval', async () => {
    const forged = await devWallet(1).signTypedData({ name: 'AgentWallet Operator Approval', version: '1', chainId: 31337, verifyingContract: fixture.deployment.contractAddress }, { ApproveTransfer: [{ name: 'proposalId', type: 'string' }, { name: 'intentId', type: 'bytes32' }, { name: 'token', type: 'address' }, { name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] }, { ...td, intentId: ethers.id('forged') });
    return asAgent.executeApprovedTransfer.staticCall({ ...td, intentId: ethers.id('forged') }, forged);
  }));
  results.push(await attack('reuse the one-run grant a second time', () => asAgent.executeGrantTransfer.staticCall(run.grantTypedData.message, run.grantSignature, ethers.id('second-run'))));
  for (const r of results) expect(r.blocked, JSON.stringify(r)).toBe(true);
  await caption(page, `4 · Compromised agent key (attacks run against the contract, nothing sent):\n${results.map((r) => `✗ ${r.attack} → ${r.error}`).join('\n')}`);
  await sleep(7000);

  // 5. Owner revokes a recurring grant on-chain from the console.
  await page.getByLabel('Recipient (allowlisted)').selectOption(fixture.payeeA.address);
  await page.getByLabel('Amount per run').fill('0.001');
  await page.getByPlaceholder('Title (optional)').fill('Weekly retainer (to revoke)');
  await page.getByRole('button', { name: 'Create task', exact: false }).click();
  const card = page.getByText('Weekly retainer (to revoke)', { exact: true }).locator('xpath=ancestor::div[contains(@class,"space-y-3")][1]');
  await card.getByRole('button', { name: 'Sign grant', exact: false }).click();
  await caption(page, '5 · Revocation: the owner revokes a signed recurring grant ON-CHAIN (revokeGrant).\nCancelling only in the backend would leave the signature usable on-chain.');
  await sleep(2500);
  await card.getByRole('button', { name: 'Revoke grant on-chain', exact: false }).click();
  await expect(card.getByText(/^Grant revoked on-chain: the contract will refuse every remaining run/)).toBeVisible();
  const tasks = await api(page, 'GET', '/tasks');
  const revokedTask = tasks.find((t) => t.title === 'Weekly retainer (to revoke)');
  expect(await v2.grantRevoked(revokedTask.grantDigest)).toBe(true);
  const afterRevoke = await attack('agent uses the revoked grant', () => asAgent.executeGrantTransfer.staticCall(revokedTask.grantTypedData.message, revokedTask.grantSignature, ethers.id('after-revoke')));
  expect(afterRevoke.error).toBe('GrantIsRevoked');
  step('grant-revoked-on-chain', { taskId: revokedTask.id, grantDigest: revokedTask.grantDigest });
  await caption(page, `5 · Grant revoked on-chain. Agent retry → ${afterRevoke.error} (nothing sent).`);
  await sleep(5000);

  // 6. Emergency stop: pause + revoke the agent in one owner transaction.
  await page.locator('a[href="/controls"]').first().click();
  await caption(page, '6 · Emergency stop: one owner transaction pauses the contract and revokes the agent key.');
  await sleep(2000);
  await page.getByRole('button', { name: 'Emergency stop (pause + revoke agent)', exact: false }).click();
  await until(async () => (await v2.agent()) === ethers.ZeroAddress && (await v2.paused()));
  const afterStop = await attack('agent key after emergency stop', () => asAgent.checkTransfer.staticCall(ethers.id('x'), ethers.ZeroAddress, fixture.payeeA.address, 1n));
  expect(afterStop.blocked).toBe(true);
  step('emergency-stop', { paused: await v2.paused(), agent: await v2.agent() });
  await caption(page, `6 · Contract paused, agent revoked. Agent retry → ${afterStop.error}.\nAll of the above: LOCAL HARDHAT, contract v2. The public Sepolia contract is v1.`);
  await sleep(6000);
  await page.screenshot({ path: path.join(OUT, 'final.png'), fullPage: false });
});
