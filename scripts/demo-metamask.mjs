#!/usr/bin/env node
/**
 * Local MetaMask demo stack: Hardhat node -> deploy -> backend (fresh database) -> console.
 *
 *   npm run demo:metamask
 *
 * Local chain only (chainId 31337). Every run starts a NEW chain, so it also uses a NEW backend database
 * (backend/data/demo/<timestamp>): Hardhat redeploys to the same contract address, and a reused database
 * would show proposals and indexer state from the previous chain. Nothing is deleted. Ctrl+C stops all.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACTS = path.join(ROOT, 'contracts');
const HARDHAT = path.join(CONTRACTS, 'node_modules', 'hardhat', 'internal', 'cli', 'cli.js');
const RPC = 'http://127.0.0.1:8545';
const API = 'http://localhost:4000/api';
const APP = 'http://localhost:5173';
const children = [];

const log = (msg) => console.log(`\x1b[36m[demo]\x1b[0m ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

function start(name, args, cwd, env = {}) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  const prefix = `\x1b[90m[${name}]\x1b[0m `;
  const print = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => console.log(prefix + l));
  // The Hardhat node prints its 20 public test keys on start; keep that out of the demo log.
  child.stdout.on('data', name === 'chain' ? () => {} : print);
  child.stderr.on('data', print);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`${prefix}exited with code ${code}; stopping the demo.`);
      shutdown(1);
    }
  });
  return child;
}

async function waitFor(label, check, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      /* not ready yet */
    }
    await sleep(400);
  }
  throw new Error(`${label} did not become ready in ${timeoutMs / 1000}s`);
}

let shuttingDown = false;
function shutdown(code = 0) {
  shuttingDown = true;
  for (const c of children.reverse()) if (c.exitCode === null) c.kill();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  for (const [port, what] of [[8545, 'Hardhat RPC'], [4000, 'backend'], [5173, 'console']]) {
    if (!(await portFree(port))) throw new Error(`Port ${port} (${what}) is already in use. Stop the other process first.`);
  }

  log('Starting Hardhat node on 127.0.0.1:8545 (chainId 31337)…');
  start('chain', [HARDHAT, 'node', '--hostname', '127.0.0.1', '--port', '8545'], CONTRACTS);
  await waitFor('Hardhat node', async () => (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) })).ok);

  log('Deploying AgentWallet, mUSDC and price feeds…');
  const deploy = spawnSync(process.execPath, [HARDHAT, 'run', 'scripts/deploy.js', '--network', 'localhost'], { cwd: CONTRACTS, stdio: 'inherit' });
  if (deploy.status !== 0) throw new Error('Deployment failed');
  const deployment = JSON.parse(fs.readFileSync(path.join(CONTRACTS, 'deployments', 'localhost.json'), 'utf8'));

  const dbDir = path.join(ROOT, 'backend', 'data', 'demo', new Date().toISOString().replace(/[:.]/g, '-'));
  log(`Starting backend on :4000 with a fresh database (${path.relative(ROOT, dbDir)})…`);
  start('backend', ['src/server.js'], path.join(ROOT, 'backend'), {
    CHAIN_ID: '31337', RPC_URL: RPC, PGLITE_DIR: dbDir, DATABASE_URL: '', APP_ORIGIN: APP,
    CORS_ORIGINS: `${APP},http://127.0.0.1:5173`, LOCAL_DEV_AGENT_INDEX: '1',
    // Local demo only: 10 minutes to talk through a MetaMask approval on stage (backend default is 180 s).
    PROPOSAL_TTL_SECONDS: '600',
  });
  await waitFor('backend', async () => (await fetch(`${API}/config`)).ok);

  log('Starting the console on :5173…');
  start('console', ['node_modules/vite/bin/vite.js', '--host', 'localhost', '--port', '5173', '--strictPort'], path.join(ROOT, 'frontend'), { VITE_API_URL: API });
  await waitFor('console', async () => (await fetch(APP)).ok);

  console.log(`
\x1b[32mAgentWallet local demo is running.\x1b[0m  Open ${APP}

MetaMask network (added automatically by "Switch network", or add it by hand):
  Network name   Hardhat Local
  RPC URL        ${RPC}
  Chain ID       31337
  Currency       ETH

Accounts (public Hardhat test accounts, local chain only; never send real funds to them):
  Owner  #0  ${deployment.owner}   <- import this one into MetaMask to sign in as owner
  Agent  #1  ${deployment.agent}   (used by the backend; do not import)
  Payees #2/#3 are allowlisted recipients.
  Get the #0 key from the Hardhat docs or "npx hardhat node" output, and import it in MetaMask under
  Add account -> Import account. Use a separate MetaMask profile, not one that holds real funds.

Contract  ${deployment.contractAddress} (wallet holds 5 ETH + 10,000 mUSDC)

This run started a NEW chain. If MetaMask was used with an earlier run, open
Settings -> Advanced -> Clear activity tab data, or transactions fail with "Nonce too high".

Press Ctrl+C to stop everything.`);
}

main().catch((err) => {
  console.error(`\x1b[31m[demo] ${err.message}\x1b[0m`);
  shutdown(1);
});
