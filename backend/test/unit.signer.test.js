import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ethers } from 'ethers';
import { loadConfig } from '../src/config/env.js';
import { createSignerProvider } from '../src/services/signerProvider.js';
import { tempDir } from './helpers/app.js';

const base = { CHAIN_ID: '31337', DEPLOYMENT_FILE: 'nonexistent.json', LOG_LEVEL: 'silent' };

describe('executor credential provider', () => {
  test('an encrypted keystore is decrypted in memory and never exposed through config', async () => {
    const dir = tempDir('aw-keystore-');
    const wallet = ethers.Wallet.createRandom();
    const json = await ethers.encryptKeystoreJson({ address: wallet.address, privateKey: wallet.privateKey }, 'correct horse battery staple', { scrypt: { N: 1024 } });
    fs.writeFileSync(path.join(dir, 'agent.json'), json);
    fs.writeFileSync(path.join(dir, 'password'), 'correct horse battery staple\n');
    const config = loadConfig({ ...base, AGENT_KEYSTORE_FILE: path.join(dir, 'agent.json'), AGENT_KEYSTORE_PASSWORD_FILE: path.join(dir, 'password') });
    assert.equal(config.executor.source.kind, 'keystore');
    assert.equal(config.executor.address, wallet.address, 'address read from keystore metadata without decrypting');
    const serialized = JSON.stringify(config, (_k, v) => (typeof v === 'bigint' ? String(v) : v));
    assert.ok(!serialized.includes('correct horse'));
    assert.ok(!serialized.includes(wallet.privateKey.slice(2)));
    const signer = await createSignerProvider(config);
    assert.equal(signer.address, wallet.address);
    assert.equal(signer.kind, 'keystore');
    assert.ok(!JSON.stringify(signer).includes(wallet.privateKey.slice(2)));
  });

  test('a wrong keystore password fails start-up instead of running without a signer', async () => {
    const dir = tempDir('aw-keystore-');
    const w = ethers.Wallet.createRandom();
    const json = await ethers.encryptKeystoreJson({ address: w.address, privateKey: w.privateKey }, 'right', { scrypt: { N: 1024 } });
    fs.writeFileSync(path.join(dir, 'agent.json'), json);
    const config = loadConfig({ ...base, AGENT_KEYSTORE_FILE: path.join(dir, 'agent.json'), AGENT_KEYSTORE_PASSWORD: 'wrong' });
    await assert.rejects(createSignerProvider(config), /password/i);
  });

  test('only one credential source may be configured', () => {
    assert.throws(() => loadConfig({ ...base, LOCAL_DEV_AGENT_INDEX: '1', AGENT_PRIVATE_KEY: ethers.Wallet.createRandom().privateKey }), /only one executor credential/);
  });

  test('no credential means the executor is disabled, not silently defaulted', async () => {
    const config = loadConfig(base);
    assert.equal(config.executor.enabled, false);
    const signer = await createSignerProvider(config);
    assert.equal(signer.address, null);
    assert.equal(signer.connect(), null);
  });
});
