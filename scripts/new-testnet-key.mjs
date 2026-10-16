#!/usr/bin/env node
/**
 * Creates a fresh random key for Base Sepolia and writes it into a git-ignored env file.
 * Prints only the address; the key is never shown.
 *
 *   node scripts/new-testnet-key.mjs contracts/.env DEPLOYER_PRIVATE_KEY
 *   node scripts/new-testnet-key.mjs backend/.env.base-sepolia AGENT_PRIVATE_KEY
 *
 * Refuses to overwrite a variable that already has a value, and refuses files git would track.
 * Testnet use only: never fund these keys with real assets.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { Wallet } = createRequire(path.join(ROOT, 'backend', 'package.json'))('ethers');

const [fileArg, name] = process.argv.slice(2);
if (!fileArg || !/^[A-Z][A-Z0-9_]*$/.test(name || '')) {
  console.error('Usage: node scripts/new-testnet-key.mjs <env file> <VARIABLE_NAME>');
  process.exit(1);
}
const file = path.resolve(ROOT, fileArg);
const ignored = spawnSync('git', ['check-ignore', '-q', file], { cwd: ROOT }).status === 0;
if (!ignored) {
  console.error(`${path.relative(ROOT, file)} is not git-ignored; refusing to write a key there.`);
  process.exit(1);
}

let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const line = new RegExp(`^${name}=(.*)$`, 'm');
const existing = text.match(line);
if (existing && existing[1].trim()) {
  console.error(`${name} already has a value in ${path.relative(ROOT, file)}; not overwriting it.`);
  process.exit(1);
}

const wallet = Wallet.createRandom();
text = existing ? text.replace(line, `${name}=${wallet.privateKey}`) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${name}=${wallet.privateKey}\n`;
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, text, { mode: 0o600 });
console.log(`${name} written to ${path.relative(ROOT, file)}`);
console.log(`Address: ${wallet.address}`);
