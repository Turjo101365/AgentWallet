#!/usr/bin/env node
/**
 * Base Sepolia (84532) profile, kept apart from the local demo.
 *
 *   node scripts/base-sepolia.mjs --check   # read-only preflight: chain, addresses, balances, deployment
 *   node scripts/base-sepolia.mjs           # start backend :4100 + console :5174 on Base Sepolia
 *
 * Credentials stay in git-ignored files: the deployer key in contracts/.env, the agent key in
 * backend/.env.base-sepolia. The backend is started with AGENT_WALLET_ENV_FILE so backend/.env (local demo)
 * is not loaded; only LLM_* values are taken from it, in memory. This script prints addresses, never keys,
 * and sends no transaction itself. The backend's executor only sends after an owner approval or an
 * owner-signed task grant, and only within the on-chain caps.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(path.join(ROOT, 'backend', 'package.json'));
const { ethers } = req('ethers');
const dotenv = req('dotenv');

const PROFILE = path.join(ROOT, 'backend', '.env.base-sepolia');
const CONTRACTS_ENV = path.join(ROOT, 'contracts', '.env');
const DEPLOYMENT = path.join(ROOT, 'contracts', 'deployments', 'base_sepolia.json');
const CHAIN_ID = 84532;
const API_PORT = 4100;
const APP_PORT = 5174;
const log = (m) => console.log(`[base-sepolia] ${m}`);
const readEnv = (f) => (fs.existsSync(f) ? dotenv.parse(fs.readFileSync(f)) : {});
const addressOf = (key) => (/^0x[0-9a-fA-F]{64}$/.test(key || '') ? new ethers.Wallet(key).address : null);

async function preflight() {
  const profile = readEnv(PROFILE);
  const contractsEnv = readEnv(CONTRACTS_ENV);
  const rpcUrl = profile.RPC_URL || 'https://sepolia.base.org';
  const provider = new ethers.JsonRpcProvider(rpcUrl, CHAIN_ID, { staticNetwork: true });
  const problems = [];
  try {
    const chainId = Number(await provider.send('eth_chainId', []));
    if (chainId !== CHAIN_ID) throw new Error(`${rpcUrl} is chain ${chainId}, expected ${CHAIN_ID}`);
    const deployment = fs.existsSync(DEPLOYMENT) ? JSON.parse(fs.readFileSync(DEPLOYMENT, 'utf8')) : null;
    const minAgent = ethers.parseEther(profile.MIN_EXECUTOR_GAS_BALANCE_ETH || '0.0005');
    // Before deployment only the owner needs funds: scripts/base-sepolia-run.mjs tops up the deployer and
    // agent from it, using the same live budget as `--plan`. After deployment the agent needs its gas floor.
    let ownerNeed = ethers.parseEther('0.00005');
    if (!deployment) {
      try {
        const run = await import(pathToFileURL(path.join(ROOT, 'scripts', 'base-sepolia-run.mjs')).href);
        ownerNeed = (await run.budget(provider, run.readKeys().keys)).totalToFundOwner;
      } catch (err) {
        problems.push(`Cannot compute the run budget: ${err.message}`);
      }
    }
    const rows = [
      ['Deployer', addressOf(contractsEnv.DEPLOYER_PRIVATE_KEY), 0n, 'contracts/.env'],
      ['Agent', addressOf(profile.AGENT_PRIVATE_KEY), deployment ? minAgent : 0n, 'backend/.env.base-sepolia'],
      ['Owner', contractsEnv.OWNER_ADDRESS && ethers.isAddress(contractsEnv.OWNER_ADDRESS) ? ethers.getAddress(contractsEnv.OWNER_ADDRESS) : null, ownerNeed, 'OWNER_ADDRESS in contracts/.env'],
    ];
    log(`RPC ${rpcUrl}: chain ${chainId}, block ${await provider.getBlockNumber()}`);
    for (const [role, address, need, where] of rows) {
      if (!address) {
        problems.push(`${role} address missing (${where})`);
        log(`${role.padEnd(8)} not configured (${where})`);
        continue;
      }
      const bal = await provider.getBalance(address);
      const ok = bal >= need;
      if (!ok) problems.push(`${role} ${address} has ${ethers.formatEther(bal)} ETH, needs ≥ ${ethers.formatEther(need)}`);
      log(`${role.padEnd(8)} ${address}  ${ethers.formatEther(bal)} ETH  ${ok ? 'ok' : `needs ≥ ${ethers.formatEther(need)} ETH`}`);
    }
    if (rows[0][1] && rows[1][1] && rows[0][1] === rows[1][1]) problems.push('Deployer and agent must be different keys');
    if (rows[2][1] && [rows[0][1], rows[1][1]].includes(rows[2][1])) problems.push('Owner must differ from the deployer and agent keys');
    if (!deployment) {
      problems.push('Not deployed yet: after funding the owner, the approved run deploys (npm run base-sepolia:execute)');
      log('Contract  not deployed yet');
    } else {
      const code = await provider.getCode(deployment.contractAddress);
      log(`Contract  ${deployment.contractAddress} ${code === '0x' ? 'NO CODE' : 'deployed'} (owner ${deployment.owner}, agent ${deployment.agent})`);
      if (code === '0x') problems.push('Deployment record points at an address without code');
      if (rows[1][1] && ethers.getAddress(deployment.agent) !== rows[1][1]) problems.push('Deployed agent differs from the agent key in backend/.env.base-sepolia');
    }
  } finally {
    provider.destroy();
  }
  return problems;
}

function start() {
  const llm = Object.fromEntries(Object.entries(readEnv(path.join(ROOT, 'backend', '.env'))).filter(([k]) => k.startsWith('LLM_') || k === 'ANTHROPIC_API_KEY'));
  const children = [];
  const run = (name, args, cwd, env) => {
    const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const print = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`[${name}] ${l.replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-[redacted]')}`));
    child.stdout.on('data', print);
    child.stderr.on('data', print);
    child.on('exit', (code) => { log(`${name} exited (${code}); stopping`); stop(1); });
    children.push(child);
  };
  let stopping = false;
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    for (const c of children) if (c.exitCode === null) c.kill();
    process.exit(code);
  };
  process.on('SIGINT', () => stop(0));
  run('backend', ['src/server.js'], path.join(ROOT, 'backend'), { ...llm, AGENT_WALLET_ENV_FILE: PROFILE });
  run('console', ['node_modules/vite/bin/vite.js', '--host', 'localhost', '--port', String(APP_PORT), '--strictPort'], path.join(ROOT, 'frontend'), { VITE_API_URL: `http://localhost:${API_PORT}/api` });
  log(`Console http://localhost:${APP_PORT} (backend :${API_PORT}). Ctrl+C stops both. The local demo (:4000/:5173) is untouched.`);
}

const problems = await preflight();
if (process.argv.includes('--check')) {
  if (problems.length) {
    log('Not ready:');
    for (const p of problems) log(`  - ${p}`);
  } else log('Ready.');
} else if (problems.length) {
  log('Refusing to start:');
  for (const p of problems) log(`  - ${p}`);
  process.exit(1);
} else start();
