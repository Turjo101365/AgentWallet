// LIVE LLM browser flow (real provider). Opt-in: LIVE_LLM=1 npx playwright test agent.live.spec.js
// The spawned backend reads LLM_* from backend/.env itself; this spec never reads or prints the key.
// Nothing is approved or broadcast: the test checks that agent output stays a draft.
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import { startTestChain, deployFixture, devWallet } from '../../../backend/test/helpers/chain.js';

test.skip(process.env.LIVE_LLM !== '1', 'set LIVE_LLM=1 to run (uses a paid API)');

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
    if (child.exitCode !== null) throw new Error(log.replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-[redacted]'));
    try { if ((await fetch(readyUrl)).ok) return; } catch {}
    await sleep(300);
  }
  throw new Error('Server not ready');
}
test.beforeAll(async () => {
  test.setTimeout(120000);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-browser-live-'));
  chain = await startTestChain();
  fixture = await deployFixture(chain.provider);
  fs.writeFileSync(path.join(dir, 'deployment.json'), JSON.stringify(fixture.deployment));
  const apiPort = 34000 + Math.floor(Math.random() * 1000);
  const webPort = apiPort + 1000;
  base = `http://127.0.0.1:${apiPort}/api`;
  url = `http://127.0.0.1:${webPort}`;
  // No LLM_* here on purpose: they come from backend/.env. Background jobs off so nothing can execute.
  await serve(['src/server.js'], path.join(root, 'backend'), { NODE_ENV: 'test', PORT: String(apiPort), HOST: '127.0.0.1', CHAIN_ID: '31337', RPC_URL: chain.rpcUrl, DEPLOYMENT_FILE: path.join(dir, 'deployment.json'), PGLITE_DIR: path.join(dir, 'pglite'), DATABASE_URL: '', LOCAL_DEV_AGENT_INDEX: '1', AGENT_PRIVATE_KEY: '', RL_SERVICE_URL: 'http://127.0.0.1:9', CORS_ORIGINS: url, BACKGROUND_JOBS: 'false', LLM_TIMEOUT_MS: '60000', LOG_LEVEL: 'warn' }, `${base}/config`);
  await serve(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], path.join(root, 'frontend'), { VITE_API_URL: base }, url);
});
test.afterAll(async () => {
  for (const child of processes.reverse()) { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } }
  await chain?.stop();
});
// Same test-only EIP-1193 bridge as wallet.spec.js (public Hardhat dev key, local chain).
async function wallet(page) {
  await page.exposeFunction('__localWallet', async ({ method, params = [] }) => {
    if (method === 'personal_sign') return owner.signMessage(ethers.getBytes(params[0]));
    if (method === 'eth_signTypedData_v4') throw Object.assign(new Error('signing disabled in live LLM test'), { code: 4001 });
    if (method === 'eth_sendTransaction') throw Object.assign(new Error('broadcast disabled in live LLM test'), { code: 4001 });
    return chain.send(method, params);
  });
  await page.addInitScript(({ address }) => {
    let connected = false, chainId = '0x1';
    const listeners = {};
    window.ethereum = {
      on: (n, f) => (listeners[n] ||= []).push(f),
      removeListener: (n, f) => { listeners[n] = (listeners[n] || []).filter(x => x !== f); },
      request: async ({ method, params }) => {
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
async function signIn(page, pathname) {
  await wallet(page);
  await page.goto(url + pathname);
  await page.getByRole('button', { name: 'Connect wallet', exact: false }).click();
  await page.getByRole('button', { name: 'Switch network', exact: false }).click();
  await page.getByRole('button', { name: 'Sign in', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Operator sign-in' })).toHaveCount(0);
}
async function ask(page, message) {
  const response = page.waitForResponse(r => r.url() === `${base}/agent/chat` && r.request().method() === 'POST', { timeout: 90000 });
  await page.getByPlaceholder('Ask the agent…').fill(message);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const res = await response;
  expect(res.status()).toBe(200);
  return { turn: (await res.json()).data, ms: Date.now() };
}

test('real LLM: instruction -> tool calls -> policy -> draft proposal and task shown in the console', async ({ page }) => {
  test.setTimeout(240000);
  await signIn(page, '/agent');
  await expect(page.getByText(/Model: openai-compatible|Model: anthropic/)).toBeVisible();
  const payeeBefore = await chain.provider.getBalance(fixture.payeeA.address);

  let t0 = Date.now();
  const { turn } = await ask(page, 'Send 0.005 ETH to my approved supplier.');
  const transferMs = Date.now() - t0;
  const proposal = turn.actions.find(a => a.type === 'proposal');
  expect(proposal?.status).toBe('AWAITING_APPROVAL');
  await expect(page.getByText('COMPLETED', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/^Plan: /).first()).toBeVisible();
  await expect(page.locator('button', { hasText: 'propose_transfer' }).first()).toBeVisible();
  await expect(page.getByText(`Proposal ${proposal.id.slice(0, 8)} · AWAITING_APPROVAL`)).toBeVisible();

  t0 = Date.now();
  const second = await ask(page, 'Also pay my supplier 0.002 ETH every Monday at 09:00 UTC for 4 weeks.');
  const scheduleMs = Date.now() - t0;
  const task = second.turn.actions.find(a => a.type === 'task');
  expect(task?.status).toBe('PENDING_AUTHORIZATION');
  await expect(page.getByText(`Task ${task.id.slice(0, 8)} · PENDING_AUTHORIZATION`)).toBeVisible();
  await page.screenshot({ path: 'test-results/agent-live-chat.png', fullPage: true });

  // The draft is on the Proposals page waiting for the owner; nothing moved on chain.
  await page.locator('a[href="/proposals"]').first().click();
  await expect(page.getByRole('button', { name: 'Approve & sign' }).first()).toBeVisible();
  expect(await chain.provider.getBalance(fixture.payeeA.address)).toBe(payeeBefore);
  const detail = await (await fetch(`${base}/config`)).json();
  console.log('LIVE_BROWSER_EVIDENCE', JSON.stringify({ proposalId: proposal.id, taskId: task.id, transferMs, scheduleMs, network: detail.data?.chainId ?? null }));
});
