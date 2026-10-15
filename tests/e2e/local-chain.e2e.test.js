/**
 * Production-like end-to-end test on a local Hardhat chain (31337). Nothing is mocked:
 *   hardhat node  ->  contracts/scripts/deploy.js  ->  backend process (PGlite on disk)
 *   ->  RL engine process (if rl-engine/.venv exists)  ->  HTTP API driven like the frontend.
 * Uses only Hardhat's public development accounts. Never touches a public network.
 *
 * Prints the transaction evidence (hash, block, gas, balances) for docs/TEST_RESULTS.md.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from '../../backend/node_modules/ethers/lib.esm/index.js';
import { startTestChain, devWallet } from '../../backend/test/helpers/chain.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HARDHAT = path.join(ROOT, 'contracts', 'node_modules', 'hardhat', 'internal', 'cli', 'cli.js');
const VENV_PY = path.join(ROOT, 'rl-engine', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const port = () => 20000 + Math.floor(Math.random() * 20000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startProcess(cmd, args, { cwd, env, readyUrl, name }) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const ready = (async () => {
    const deadline = Date.now() + 60000;
    for (;;) {
      if (child.exitCode !== null) throw new Error(`${name} exited early:\n${log}`);
      try {
        const res = await fetch(readyUrl);
        if (res.status < 500) return;
      } catch {
        /* starting */
      }
      if (Date.now() > deadline) throw new Error(`${name} did not become ready:\n${log}`);
      await sleep(300);
    }
  })();
  return {
    ready,
    log: () => log,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill();
      await new Promise((r) => child.once('exit', r));
    },
  };
}

describe('local-chain end-to-end', () => {
  let chain, rl, backend, base, deployment, workDir, token;
  const owner = devWallet(0);
  const evidence = {};
  let backendEnv;

  const call = async (method, p, body, headers = {}) => {
    const res = await fetch(`${base}${p}`, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };

  before(async () => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-e2e-'));
    chain = await startTestChain();
    execFileSync(process.execPath, [HARDHAT, 'run', 'scripts/deploy.js', '--network', 'localhost'], {
      cwd: path.join(ROOT, 'contracts'),
      env: { ...process.env, LOCAL_RPC_URL: chain.rpcUrl, DEPLOYMENTS_DIR: workDir },
      stdio: 'pipe',
    });
    deployment = JSON.parse(fs.readFileSync(path.join(workDir, 'localhost.json'), 'utf8'));

    let rlUrl = 'http://127.0.0.1:9';
    if (fs.existsSync(VENV_PY)) {
      const rlPort = port();
      rlUrl = `http://127.0.0.1:${rlPort}`;
      rl = startProcess(VENV_PY, ['-B', '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(rlPort)], {
        cwd: path.join(ROOT, 'rl-engine'), env: { PYTHONDONTWRITEBYTECODE: '1' }, readyUrl: `${rlUrl}/health`, name: 'rl-engine',
      });
      await rl.ready;
    }

    const apiPort = port();
    base = `http://127.0.0.1:${apiPort}/api`;
    backendEnv = {
      NODE_ENV: 'test',
      PORT: String(apiPort),
      HOST: '127.0.0.1',
      CHAIN_ID: '31337',
      RPC_URL: chain.rpcUrl,
      DEPLOYMENT_FILE: path.join(workDir, 'localhost.json'),
      PGLITE_DIR: path.join(workDir, 'pglite'),
      LOCAL_DEV_AGENT_INDEX: '1',
      RL_SERVICE_URL: rlUrl,
      INDEXER_POLL_MS: '500',
      SCHEDULER_TICK_MS: '500',
      GAS_SAMPLE_INTERVAL_SECONDS: '1',
      SNAPSHOT_INTERVAL_SECONDS: '5',
      TASK_LEASE_SECONDS: '10',
      LOG_LEVEL: 'warn',
      DATABASE_URL: '',
      AGENT_PRIVATE_KEY: '',
    };
    backend = startProcess(process.execPath, ['src/server.js'], { cwd: path.join(ROOT, 'backend'), env: backendEnv, readyUrl: `${base}/config`, name: 'backend' });
    await backend.ready;
  });

  after(async () => {
    await backend?.stop();
    await rl?.stop();
    await chain?.stop();
    if (Object.keys(evidence).length) console.log(`\nE2E_EVIDENCE ${JSON.stringify(evidence, null, 2)}`);
  });

  test('health is ok with a verified chain, database and executor', async () => {
    const res = await fetch(base.replace(/\/api$/, '/health'));
    const health = await res.json();
    assert.equal(res.status, 200, JSON.stringify(health));
    assert.equal(health.checks.chain.status, 'ok');
    assert.equal(health.checks.chain.rpcChainId, 31337);
    assert.equal(health.checks.executor.status, 'enabled');
    assert.equal(health.checks.executor.address, deployment.agent);
    evidence.rlEngine = health.checks.rlEngine;
  });

  test('owner signs in with SIWE and gets the owner role from the contract', async () => {
    const { body } = await call('POST', '/auth/nonce', { address: owner.address });
    const signature = await owner.signMessage(body.data.message);
    const verified = await call('POST', '/auth/verify', { message: body.data.message, signature });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.data.role, 'owner');
    token = verified.body.data.token;
  });

  test('a real agent transfer: proposal -> EIP-712 approval -> executor -> verified receipt', async () => {
    const payee = deployment.demoRecipients[0].address;
    const before = await chain.provider.getBalance(payee);
    const walletBefore = await chain.provider.getBalance(deployment.contractAddress);

    const created = await call('POST', '/proposals', { token: ethers.ZeroAddress, recipient: payee, amount: '0.0075', memo: 'E2E invoice' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const p = created.body.data;
    assert.equal(p.status, 'AWAITING_APPROVAL', JSON.stringify(p.policyResult.violations));

    const { domain, types, message } = p.approvalTypedData;
    const signature = await owner.signTypedData(domain, types, message);
    const approved = await call('POST', `/proposals/${p.id}/approve`, { signature }, { 'idempotency-key': `e2e-${p.id}` });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));

    let final;
    for (let i = 0; i < 100; i++) {
      final = (await call('GET', `/proposals/${p.id}`)).body.data;
      if (['CONFIRMED', 'FAILED'].includes(final.status)) break;
      await sleep(200);
    }
    assert.equal(final.status, 'CONFIRMED', final.resolutionReason);

    const receipt = await chain.provider.getTransactionReceipt(final.execution.txHash);
    assert.equal(receipt.status, 1);
    assert.equal(receipt.from, deployment.agent);
    assert.equal(receipt.to, deployment.contractAddress);
    const after = await chain.provider.getBalance(payee);
    assert.equal(after - before, ethers.parseEther('0.0075'));

    Object.assign(evidence, {
      contract: deployment.contractAddress,
      owner: deployment.owner,
      agentExecutor: deployment.agent,
      recipient: payee,
      proposalId: p.id,
      intentId: p.intentId,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      recipientDeltaWei: (after - before).toString(),
      walletBalanceBeforeEth: ethers.formatEther(walletBefore),
      walletBalanceAfterEth: ethers.formatEther(await chain.provider.getBalance(deployment.contractAddress)),
      simulationGasEstimate: p.simulation.gasEstimate,
    });
  });

  test('the indexer records the TransferExecuted event in verified history', async () => {
    let entry;
    for (let i = 0; i < 40 && !entry; i++) {
      const history = (await call('GET', '/transactions')).body.data;
      entry = history.find((h) => h.txHash === evidence.txHash && h.events.some((e) => e.name === 'TransferExecuted'));
      if (!entry) await sleep(250);
    }
    assert.ok(entry, 'transfer appears in indexed history');
    assert.equal(entry.status, 'CONFIRMED');
  });

  test('trained RL checkpoints serve genuine timing inference through the backend', async (t) => {
    if (!rl) return t.skip('rl-engine/.venv not found');
    const models = (await call('GET', '/rl/models')).body.data;
    const available = models.filter((m) => m.status === 'available');
    if (available.length === 0) return t.skip('no trained checkpoints in rl-engine/models (run python -m app.training.train)');
    for (const m of available) assert.match(m.version, /-timing-/);
    await sleep(2500); // let the server's scheduler record a few real gas samples
    const advice = (await call('POST', '/rl/timing-preview', { windowSeconds: 600 })).body.data;
    assert.equal(advice.status, 'ok', JSON.stringify(advice));
    assert.ok(['WAIT', 'EXECUTE_NOW'].includes(advice.advice));
    assert.ok(advice.samples >= 2);
    assert.equal(advice.observation.length, 8);
    evidence.rlTiming = { agentType: advice.agentType, modelVersion: advice.modelVersion, advice: advice.advice, samples: advice.samples, actionProbabilities: advice.actionProbabilities };
  });

  test('autonomous scheduled payment: signed grant -> background scheduler -> RL timing -> agent tx -> confirmed', async () => {
    const payee = deployment.demoRecipients[1].address;
    const before = await chain.provider.getBalance(payee);
    assert.equal((await call('PUT', '/policy', { autoApprovalMaxPerTx: { [ethers.ZeroAddress]: ethers.parseEther('0.005').toString() }, confirmLoosening: true })).status, 200);
    const now = Math.floor(Date.now() / 1000);
    const created = await call('POST', '/tasks', {
      token: ethers.ZeroAddress, recipient: payee, amount: '0.0025', title: 'E2E contractor payment',
      schedule: { type: 'once', at: now + 2 }, validUntil: now + 3600, executionWindowSeconds: rl ? 6 : 0, useRlTiming: Boolean(rl),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const task = created.body.data;
    const { domain, types, message } = task.grantTypedData;
    const auth = await call('POST', `/tasks/${task.id}/authorize`, { signature: await owner.signTypedData(domain, types, message) });
    assert.equal(auth.status, 200, JSON.stringify(auth.body));

    let final;
    for (let i = 0; i < 120; i++) {
      final = (await call('GET', `/tasks/${task.id}`)).body.data;
      if (final.runs[0] && ['CONFIRMED', 'FAILED', 'SKIPPED'].includes(final.runs[0].status)) break;
      await sleep(250);
    }
    const run = final.runs[0];
    assert.equal(run.status, 'CONFIRMED', JSON.stringify(run));
    assert.equal(final.status, 'COMPLETED');
    const proposal = (await call('GET', `/proposals/${run.proposalId}`)).body.data;
    assert.equal(proposal.approvalKind, 'TASK_GRANT');
    const receipt = await chain.provider.getTransactionReceipt(proposal.execution.txHash);
    assert.equal(receipt.status, 1);
    assert.equal(receipt.from, deployment.agent);
    assert.equal((await chain.provider.getBalance(payee)) - before, ethers.parseEther('0.0025'));
    evidence.autonomousRun = {
      taskId: task.id, runStatus: run.status, decision: run.decision?.outcome, timing: run.timingAdvice ? { status: run.timingAdvice.status, advice: run.timingAdvice.advice, modelVersion: run.timingAdvice.modelVersion } : null,
      txHash: receipt.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(),
    };
  });

  test('portfolio valuation uses the deployed (synthetic) price feeds', async () => {
    const o = (await call('GET', '/portfolio')).body.data;
    assert.equal(o.valuationComplete, true);
    assert.ok(o.assets.every((a) => /synthetic/.test(a.price.source)));
    evidence.portfolio = { totalUsd: o.totalUsd, allocation: o.assets.map((a) => `${a.symbol} ${a.allocationPct}%`) };
  });

  test('state and sessions survive a backend restart; the audit chain verifies', async () => {
    await backend.stop();
    backend = startProcess(process.execPath, ['src/server.js'], { cwd: path.join(ROOT, 'backend'), env: backendEnv, readyUrl: `${base}/config`, name: 'backend-restart' });
    await backend.ready;
    const session = await call('GET', '/auth/session');
    assert.equal(session.status, 200);
    const p = (await call('GET', `/proposals/${evidence.proposalId}`)).body.data;
    assert.equal(p.status, 'CONFIRMED');
    assert.equal(p.execution.txHash, evidence.txHash);
    const audit = (await call('GET', '/audit/verify')).body.data;
    assert.equal(audit.valid, true);
    evidence.auditEntries = audit.entries;
  });
});
