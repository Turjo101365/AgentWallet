import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import { startTestChain, deployFixture, devWallet } from '../../../backend/test/helpers/chain.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let chain, fixture, base, url, dir;
const processes = [];
const owner = devWallet(0);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function serve(args, cwd, env, readyUrl) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  processes.push(child);
  let log = '';
  child.stdout.on('data', d => log += d);
  child.stderr.on('data', d => log += d);
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null) throw new Error(log);
    try { if ((await fetch(readyUrl)).ok) return; } catch {}
    await sleep(300);
  }
  throw new Error(`Server not ready: ${log}`);
}
test.beforeAll(async () => {
  test.setTimeout(120000);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-browser-'));
  chain = await startTestChain();
  fixture = await deployFixture(chain.provider);
  fs.writeFileSync(path.join(dir, 'deployment.json'), JSON.stringify(fixture.deployment));
  const apiPort = 30000 + Math.floor(Math.random() * 2000);
  const webPort = apiPort + 2000;
  base = `http://127.0.0.1:${apiPort}/api`;
  url = `http://127.0.0.1:${webPort}`;
  await serve(['src/server.js'], path.join(root, 'backend'), { NODE_ENV: 'test', PORT: String(apiPort), HOST: '127.0.0.1', CHAIN_ID: '31337', RPC_URL: chain.rpcUrl, DEPLOYMENT_FILE: path.join(dir, 'deployment.json'), PGLITE_DIR: path.join(dir, 'pglite'), DATABASE_URL: '', LOCAL_DEV_AGENT_INDEX: '1', AGENT_PRIVATE_KEY: '', LLM_PROVIDER: 'none', ANTHROPIC_API_KEY: '', LLM_API_KEY: '', LLM_BASE_URL: 'http://127.0.0.1:9', RL_SERVICE_URL: 'http://127.0.0.1:9', CORS_ORIGINS: url, INDEXER_POLL_MS: '300', SCHEDULER_TICK_MS: '500', LOG_LEVEL: 'warn' }, `${base}/config`);
  await serve(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], path.join(root, 'frontend'), { VITE_API_URL: base }, url);
});
test.afterAll(async () => {
  for (const child of processes.reverse()) { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } }
  await chain?.stop();
});
// Test-only EIP-1193 bridge. Real SIWE/EIP-712 signatures use public Hardhat dev keys.
// No API responses are mocked; this is not a MetaMask extension test.
async function wallet(page) {
  await page.exposeFunction('__localWallet', async ({ method, params = [] }) => {
    if (method === 'personal_sign') return owner.signMessage(ethers.getBytes(params[0]));
    if (method === 'eth_signTypedData_v4') { const d = JSON.parse(params[1]); delete d.types.EIP712Domain; return owner.signTypedData(d.domain, d.types, d.message); }
    return chain.send(method, params);
  });
  await page.addInitScript(({ address }) => {
    let connected = false, chainId = '0x1', reject = false;
    const listeners = {};
    window.__rejectNextWalletRequest = () => { reject = true; };
    window.ethereum = {
      on: (n, f) => (listeners[n] ||= []).push(f),
      removeListener: (n, f) => { listeners[n] = (listeners[n] || []).filter(x => x !== f); },
      request: async ({ method, params }) => {
        if (reject && ['personal_sign', 'eth_signTypedData_v4', 'eth_sendTransaction'].includes(method)) { reject = false; throw Object.assign(new Error('User rejected request'), { code: 4001 }); }
        if (method === 'personal_sign') {
          // Like MetaMask: a SIWE message must name this page's host, or the wallet flags it as deceptive.
          const text = new TextDecoder().decode(Uint8Array.from(params[0].slice(2).match(/../g).map((b) => parseInt(b, 16))));
          if (/wants you to sign in/.test(text) && !text.startsWith(`${location.host} wants you to sign in`)) throw Object.assign(new Error(`SIWE domain mismatch: ${text.split(' ')[0]} vs ${location.host}`), { code: 4001 });
        }
        if (method === 'eth_accounts') return connected ? [address] : [];
        if (method === 'eth_requestAccounts') { connected = true; return [address]; }
        if (method === 'eth_chainId') return chainId;
        if (method === 'wallet_switchEthereumChain') { chainId = params[0].chainId; (listeners.chainChanged || []).forEach(f => f(chainId)); return null; }
        return window.__localWallet({ method, params });
      },
    };
  }, { address: owner.address });
}
async function signIn(page, pathname = '/') {
  await wallet(page);
  await page.goto(url + pathname);
  await page.getByRole('button', { name: 'Connect wallet', exact: false }).click();
  await expect(page.getByRole('button', { name: 'Switch network', exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Switch network', exact: false }).click();
  await page.getByRole('button', { name: 'Sign in', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Operator sign-in' })).toHaveCount(0);
}
async function navigate(page, pathname) { await page.locator(`a[href="${pathname}"]`).first().click(); }
async function proposal(page, memo, amount = '0.001') {
  await page.getByLabel('Recipient (must be on the on-chain allowlist)').fill(fixture.payeeA.address);
  await page.getByLabel('Amount (ETH)').fill(amount);
  await page.getByLabel('Memo (optional)').fill(memo);
  const response = page.waitForResponse(r => r.url() === `${base}/proposals` && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create proposal' }).click();
  const res = await response; expect(res.status()).toBe(201);
  return (await res.json()).data;
}
test('wallet network selection, SIWE, approval/rejection, mined transfer and indexed history', async ({ page }) => {
  await signIn(page, '/proposals');
  const before = await chain.provider.getBalance(fixture.payeeA.address);
  const created = await proposal(page, 'Browser approved payment');
  await page.evaluate(() => window.__rejectNextWalletRequest());
  await page.getByRole('button', { name: 'Confirm in wallet' }).click();
  await expect(page.getByText('You rejected the request in your wallet.')).toBeVisible();
  expect(await chain.provider.getBalance(fixture.payeeA.address)).toBe(before);
  await page.getByRole('button', { name: 'Confirm in wallet' }).click();
  await expect(page.getByText('Execution: CONFIRMED')).toBeVisible({ timeout: 30000 });
  const txHash = (await page.getByText(/^Tx: 0x/).textContent()).match(/0x[0-9a-f]{64}/i)[0];
  const receipt = await chain.provider.getTransactionReceipt(txHash);
  expect(receipt.status).toBe(1);
  expect(receipt.to.toLowerCase()).toBe(fixture.deployment.contractAddress.toLowerCase());
  expect((await chain.provider.getBalance(fixture.payeeA.address)) - before).toBe(ethers.parseEther('0.001'));
  await proposal(page, 'Browser rejected payment');
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByText('Rejected by operator in console', { exact: false })).toBeVisible();
  await navigate(page, '/transactions');
  await expect(page.getByText(txHash, { exact: true })).toBeVisible({ timeout: 30000 });
  console.log('BROWSER_CHAIN_EVIDENCE', JSON.stringify({ proposalId: created.id, txHash, block: receipt.blockNumber, gasUsed: receipt.gasUsed.toString() }));
});
test('owner transaction rejection and actual contract pause/unpause', async ({ page }) => {
  await signIn(page, '/controls');
  await page.evaluate(() => window.__rejectNextWalletRequest());
  await page.getByRole('button', { name: 'Pause contract', exact: true }).click();
  await expect(page.getByText('You rejected the request in your wallet.')).toBeVisible();
  expect(await fixture.wallet.paused()).toBe(false);
  await page.getByRole('button', { name: 'Pause contract', exact: true }).click();
  await expect(page.getByText(/Pause contract: confirmed in block/)).toBeVisible({ timeout: 30000 });
  expect(await fixture.wallet.paused()).toBe(true);
  await page.getByRole('button', { name: 'Unpause contract', exact: true }).click();
  await expect(page.getByText(/Unpause contract: confirmed in block/)).toBeVisible({ timeout: 30000 });
  expect(await fixture.wallet.paused()).toBe(false);
});
test('portfolio prices, bounded automation grant lifecycle, and truthful unavailable AI', async ({ page }) => {
  await signIn(page, '/portfolio');
  await expect(page.getByText('local-mock-feed (synthetic)', { exact: false }).first()).toBeVisible();
  await navigate(page, '/automation');
  await page.getByLabel('Recipient (allowlisted)').selectOption(fixture.payeeA.address);
  await page.getByLabel('Amount per run').fill('0.001');
  await page.getByPlaceholder('Title (optional)').fill('Browser bounded grant');
  await page.getByRole('button', { name: 'Create task', exact: false }).click();
  await page.getByRole('button', { name: 'Sign grant', exact: false }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('CANCELLED', { exact: true })).toBeVisible();
  await navigate(page, '/agent');
  await expect(page.getByText('No language model configured', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Ask your AI assistant…').fill('Show my portfolio');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('UNAVAILABLE', { exact: true })).toBeVisible();
});


test('contract v2: signed deadline is shown, and the owner revokes a task grant on-chain so the agent key can no longer use it', async ({ page }) => {
  const v2 = new ethers.Contract(fixture.deployment.contractAddress, JSON.parse(fs.readFileSync(path.join(root, 'shared', 'abi', 'AgentWallet.json'), 'utf8')).abi, chain.provider);
  expect(Number(await v2.VERSION())).toBe(2);
  await signIn(page, '/proposals');
  await proposal(page, 'deadline display');
  await expect(page.getByTestId('signed-deadline').first()).toContainText('Execution deadline (signed)');
  await expect(page.getByTestId('signed-deadline').first()).toContainText('never extended');

  await navigate(page, '/automation');
  await page.getByLabel('Recipient (allowlisted)').selectOption(fixture.payeeA.address);
  await page.getByLabel('Amount per run').fill('0.001');
  await page.getByPlaceholder('Title (optional)').fill('Grant to revoke on-chain');
  await page.getByRole('button', { name: 'Create task', exact: false }).click();
  await page.getByRole('button', { name: 'Sign grant', exact: false }).click();
  const card = page.getByText('Grant to revoke on-chain', { exact: true }).locator('xpath=ancestor::div[contains(@class,"space-y-3")][1]');
  const revoke = card.getByRole('button', { name: 'Revoke grant on-chain', exact: false });
  await expect(revoke).toBeVisible();

  const { token } = await page.evaluate(() => JSON.parse(sessionStorage.getItem('aw.session')));
  const tasks = (await (await fetch(`${base}/tasks`, { headers: { Authorization: `Bearer ${token}` } })).json()).data;
  const task = tasks.find((t) => t.title === 'Grant to revoke on-chain');
  expect(task.status).toBe('ACTIVE');
  expect(task.grantDigest).toBe(ethers.TypedDataEncoder.hash(task.grantTypedData.domain, task.grantTypedData.types, task.grantTypedData.message));
  expect(await v2.grantRevoked(task.grantDigest)).toBe(false);

  // Before revocation the signed grant is valid on-chain for the agent key (static call only, nothing sent).
  const agent = devWallet(1, chain.provider);
  const asAgent = v2.connect(agent);
  await asAgent.executeGrantTransfer.staticCall(task.grantTypedData.message, task.grantSignature, ethers.id('browser-probe-1'));

  await revoke.click();
  await expect(card.getByText('CANCELLED', { exact: true })).toBeVisible();
  await expect(card.getByText(/^Grant revoked on-chain: the contract will refuse every remaining run/)).toBeVisible();
  await expect(revoke).toHaveCount(0);
  expect(await v2.grantRevoked(task.grantDigest)).toBe(true);
  const revokedLogs = await chain.provider.getLogs({ address: fixture.deployment.contractAddress, topics: [v2.interface.getEvent('GrantRevoked').topicHash, task.grantDigest] });
  expect(revokedLogs.length).toBe(1);

  // A compromised agent key holding the signed grant can no longer execute it.
  const nonce = await chain.provider.getTransactionCount(agent.address);
  await expect(asAgent.executeGrantTransfer(task.grantTypedData.message, task.grantSignature, ethers.id('browser-probe-2'))).rejects.toThrow(/GrantIsRevoked|reverted/);
  expect(await chain.provider.getTransactionCount(agent.address)).toBe(nonce);
  let decoded = null;
  try { await asAgent.executeGrantTransfer.staticCall(task.grantTypedData.message, task.grantSignature, ethers.id('browser-probe-3')); } catch (err) { decoded = v2.interface.parseError(err.data)?.name; }
  expect(decoded).toBe('GrantIsRevoked');
});
