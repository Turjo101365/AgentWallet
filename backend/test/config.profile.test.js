import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ethers } from 'ethers';
import { tempDir } from './helpers/app.js';

// A public-testnet profile (AGENT_WALLET_ENV_FILE) must be loaded INSTEAD of backend/.env, so the local
// demo's settings (dev executor, chain 31337, database) never mix with Base Sepolia credentials.
const ENV_JS = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/config/env.js')).href;
const PROBE = `
  const { loadDotenv, loadConfig } = await import(${JSON.stringify(ENV_JS)});
  try {
    loadDotenv();
    const c = loadConfig(process.env);
    console.log(JSON.stringify({ chainId: c.chainId, executor: c.executor.source.kind, executorAddress: c.executor.address, localDevIndex: process.env.LOCAL_DEV_AGENT_INDEX ?? null, indexerBlockRange: c.indexerBlockRange, pglite: c.pgliteDir }));
  } catch (err) { console.log(JSON.stringify({ error: err.message })); }`;

function probe(env) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(LLM_|ANTHROPIC|AGENT_|CHAIN_ID|RPC_URL|LOCAL_DEV|PGLITE|DEPLOYMENT_FILE|ALLOW_PUBLIC|INDEXER_)/.test(k)));
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', PROBE], { env: { ...clean, ...env }, encoding: 'utf8' });
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

describe('backend env profiles', () => {
  test('AGENT_WALLET_ENV_FILE loads only that profile: Base Sepolia key, no local dev executor', () => {
    const dir = tempDir('aw-profile-');
    const key = ethers.Wallet.createRandom();
    const file = path.join(dir, '.env.base-sepolia');
    fs.writeFileSync(file, [
      'CHAIN_ID=84532', 'DEPLOYMENT_FILE=none.json', 'LOG_LEVEL=silent', `PGLITE_DIR=${path.join(dir, 'db')}`,
      `AGENT_PRIVATE_KEY=${key.privateKey}`, 'ALLOW_PUBLIC_TESTNET_EXECUTION=true',
    ].join('\n'));
    const out = probe({ AGENT_WALLET_ENV_FILE: file });
    assert.equal(out.error, undefined, out.error);
    assert.equal(out.chainId, 84532);
    assert.equal(out.executor, 'env-key');
    assert.equal(out.executorAddress, key.address);
    assert.equal(out.localDevIndex, null, 'backend/.env (LOCAL_DEV_AGENT_INDEX) must not be loaded');
    assert.equal(out.indexerBlockRange, 200);
    assert.equal(out.pglite, path.join(dir, 'db'));
  });

  test('a missing profile file fails start-up instead of silently falling back to backend/.env', () => {
    const out = probe({ AGENT_WALLET_ENV_FILE: path.join(tempDir('aw-profile-'), 'missing.env') });
    assert.match(out.error, /AGENT_WALLET_ENV_FILE .* does not exist/);
  });
});
