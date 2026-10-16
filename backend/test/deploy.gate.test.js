import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir } from './helpers/app.js';
import { spawn } from 'node:child_process';
import { deployGate, resetDeployGate } from '../../scripts/deploy-gate.mjs';
import { childStopper } from '../../scripts/base-sepolia-run.mjs';

// The recorded public run must always leave contracts/.env at CONFIRM_PUBLIC_DEPLOY=no.
describe('public deployment gate', () => {
  const file = (content) => {
    const f = path.join(tempDir('aw-gate-'), '.env');
    fs.writeFileSync(f, content);
    return f;
  };

  test('reset turns yes into no and leaves every other line untouched', () => {
    const f = file('DEPLOYER_PRIVATE_KEY=0xabc\nCONFIRM_PUBLIC_DEPLOY=yes\nOTHER=1\n');
    assert.equal(deployGate(f), 'yes');
    assert.equal(resetDeployGate(f), 'no');
    assert.equal(fs.readFileSync(f, 'utf8'), 'DEPLOYER_PRIVATE_KEY=0xabc\nCONFIRM_PUBLIC_DEPLOY=no\nOTHER=1\n');
  });

  test('reset is idempotent and adds the line when it is missing', () => {
    const f = file('A=1');
    assert.equal(deployGate(f), null);
    assert.equal(resetDeployGate(f), 'no');
    assert.equal(resetDeployGate(f), 'no');
    assert.equal(fs.readFileSync(f, 'utf8'), 'A=1\nCONFIRM_PUBLIC_DEPLOY=no\n');
  });

  test('regression (first successful public run): stopping a child twice resolves instead of hanging', async () => {
    // A killed child keeps exitCode === null on Windows; the old stop() then waited for an 'exit' that had already fired.
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    const stop = childStopper(child);
    const within = (p, ms) => Promise.race([p.then(() => 'done'), new Promise((r) => setTimeout(() => r('hung'), ms))]);
    assert.equal(await within(stop(), 10000), 'done');
    assert.equal(await within(stop(), 3000), 'done', 'second stop must not hang');
  });
});
