#!/usr/bin/env node
/**
 * AgentWallet contract v2 on Ethereum Sepolia: the ONLY entry point for the v2 public run. Fixed to the "sepolia-v2"
 * target, so it can never touch the frozen v1 run (contracts/deployments/sepolia.json, backend/data/sepolia,
 * evidence/sepolia/).
 *
 *   node scripts/sepolia-v2.mjs --plan                 # read-only: guards, compiled version, live gas, deploy estimate, balances
 *   node scripts/sepolia-v2.mjs --rehearse [--headed]  # the full recorded sequence on a throwaway LOCAL chain (real AI)
 *   node scripts/sepolia-v2.mjs --execute --i-approve-sepolia-v2-full-transactions [--headed]
 *                                                       # PUBLIC: also needs CONFIRM_PUBLIC_DEPLOY=yes in contracts/.env
 *
 * The first public v2 run (target sepolia-v2, evidence/sepolia-v2/) stopped at its autonomous transfer and is frozen.
 * This entry point now targets a FRESH deployment: sepolia-v2-full (contracts/deployments/sepolia-v2-full.json,
 * backend/data/sepolia-v2-full, evidence/sepolia-v2-full/).
 *
 * Every mode prints what it will do first. --execute refuses unless the guards pass, the flag is given and the gate is
 * "yes"; the gate is reset to "no" when the run ends, however it ends.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = 'sepolia-v2-full'; // the first v2 run (target sepolia-v2) is frozen
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const passthrough = args.filter((a) => ['--headed', '--rpc'].includes(a) || (args[args.indexOf(a) - 1] === '--rpc'));

const node = (script, extra) => new Promise((resolve) => {
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', script), ...extra], { cwd: ROOT, stdio: 'inherit' });
  child.on('exit', (code) => resolve(code ?? 1));
});

async function main() {
  const run = await import(pathToFileURL(path.join(ROOT, 'scripts', 'base-sepolia-run.mjs')).href);
  const modes = ['--plan', '--rehearse', '--execute'].filter(has);
  if (modes.length !== 1) throw new Error('Pass exactly one of --plan, --rehearse, --execute');
  const version = run.artifactVersion();
  console.log(`[v2] target ${TARGET}: deployment ${run.TARGETS[TARGET].deployment}, database ${run.TARGETS[TARGET].db}, evidence ${run.TARGETS[TARGET].evidence}; compiled AgentWallet v${version}`);
  if (has('--plan')) {
    run.assertTargetSafe(TARGET, { artifactVersion: version });
    console.log('[v2] guards pass: target not frozen, no protected v1 path, evidence folder empty, compiled v2');
    return node('base-sepolia-run.mjs', ['--network', TARGET, '--plan']);
  }
  if (has('--rehearse')) return node('sepolia-demo.mjs', ['--rehearse', '--with-ai', '--target', TARGET, ...passthrough]);
  if (has('--execute')) {
    run.assertTargetSafe(TARGET, { artifactVersion: version });
    if (!has(`--i-approve-${TARGET}-transactions`)) throw new Error(`Refusing: pass --i-approve-${TARGET}-transactions (and set CONFIRM_PUBLIC_DEPLOY=yes)`);
    return node('sepolia-demo.mjs', ['--execute', '--target', TARGET, `--i-approve-${TARGET}-transactions`, ...passthrough]);
  }
}

main().then((code) => process.exit(code || 0), (err) => {
  console.error(`[v2] ${err.message}`);
  process.exit(1);
});
