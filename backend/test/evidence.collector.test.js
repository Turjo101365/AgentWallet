import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { ethers } from 'ethers';
import { startTestChain, deployFixture } from './helpers/chain.js';
import { buildTestApp, signIn, signApproval, bearer, idemKey, waitFor, tempDir } from './helpers/app.js';
import { collectEvidence } from '../../scripts/collect-evidence.mjs';

// Deliverable 06 evidence collector, exercised end to end on a local chain: one owner-approved
// transfer and one autonomous scheduler run must be labelled correctly from chain data plus a
// snapshot of the backend database, and every on-chain check must hold.

const ETH = ethers.ZeroAddress;
const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('evidence collector (scripts/collect-evidence.mjs)', () => {
  let chain, fx, dbDir, deploymentFile, txOwnerApproved, txAutonomous, taskId;

  before(async () => {
    chain = await startTestChain();
    fx = await deployFixture(chain.provider);
    dbDir = path.join(tempDir('aw-evidence-'), 'pglite');
    const ctx = await buildTestApp({ rpcUrl: chain.rpcUrl, deployment: fx.deployment, env: { PGLITE_DIR: dbDir, TASK_LEASE_SECONDS: '5' } });
    const token = await signIn(ctx.app, fx.owner);
    const api = (method, url) => request(ctx.app)[method](`/api${url}`).set(bearer(token));

    // Owner-approved: proposal + EIP-712 owner signature.
    const p = (await api('post', '/proposals').send({ token: ETH, recipient: fx.payeeA.address, amount: '0.001' }).expect(201)).body.data;
    await api('post', `/proposals/${p.id}/approve`).set('Idempotency-Key', idemKey()).send({ signature: await signApproval(fx.owner, p) }).expect(200);
    txOwnerApproved = (await waitFor(async () => {
      const x = (await api('get', `/proposals/${p.id}`)).body.data;
      return x.status === 'CONFIRMED' ? x : null;
    })).execution.txHash;

    // Autonomous: owner-signed task grant + auto-approval limit, then the scheduler executes on its own.
    await api('put', '/policy').send({ autoApprovalMaxPerTx: { [ETH]: ethers.parseEther('0.005').toString() }, confirmLoosening: true }).expect(200);
    const task = (await api('post', '/tasks').send({ token: ETH, recipient: fx.payeeA.address, amount: '0.002', title: 'Evidence run', validUntil: now() + 3600, schedule: { type: 'once', at: now() + 1 } }).expect(201)).body.data;
    taskId = task.id;
    const { domain, types, message } = task.grantTypedData;
    await api('post', `/tasks/${task.id}/authorize`).send({ signature: await fx.owner.signTypedData(domain, types, message) }).expect(200);
    await sleep(1500);
    const run = await waitFor(async () => {
      await ctx.container.scheduler.tick();
      await ctx.container.executor.whenIdle();
      const t = (await api('get', `/tasks/${task.id}`)).body.data;
      return t.runs[0]?.status === 'CONFIRMED' ? t.runs[0] : null;
    }, { timeoutMs: 30000, intervalMs: 300 });
    txAutonomous = (await api('get', `/proposals/${run.proposalId}`)).body.data.execution.txHash;
    await ctx.container.close(); // the collector reads a copy; closing first keeps the copy consistent

    deploymentFile = path.join(path.dirname(dbDir), 'deployment.json');
    fs.writeFileSync(deploymentFile, JSON.stringify(fx.deployment));
  });
  after(async () => chain?.stop());

  test('labels each agent transfer, verifies it against on-chain policy, and writes a report', async () => {
    const out = path.join(path.dirname(dbDir), 'evidence');
    const ev = await collectEvidence({ deployment: deploymentFile, rpc: chain.rpcUrl, db: dbDir, out });

    assert.equal(ev.readOnly, true);
    assert.equal(ev.summary.agentTransfers, 2);
    assert.equal(ev.summary.autonomous, 1);
    assert.equal(ev.summary.ownerApproved, 1);
    assert.equal(ev.summary.allTransfersPassedOnChainChecks, true);
    assert.equal(ev.summary.auditLog.valid, true);

    const auto = ev.transfers.find((t) => t.txHash === txAutonomous);
    assert.equal(auto.authorization, 'AUTONOMOUS');
    assert.equal(auto.amountWei, ethers.parseEther('0.002').toString());
    assert.equal(auto.offchain.approvalKind, 'TASK_GRANT');
    assert.equal(auto.offchain.ownerSignatureOnThisTransfer, false, 'no per-transfer owner signature');
    assert.equal(auto.offchain.authorizedByTaskGrantSignature, true, 'authorized by the owner-signed grant');
    assert.equal(auto.offchain.task.id, taskId);
    assert.equal(auto.offchain.task.hasGrantSignature, true);
    assert.equal(auto.offchain.task.grantSignedBy, fx.owner.address);

    const manual = ev.transfers.find((t) => t.txHash === txOwnerApproved);
    assert.equal(manual.authorization, 'OWNER_APPROVED');
    assert.equal(manual.offchain.ownerSignatureOnThisTransfer, true);
    assert.equal(manual.offchain.authorizedByTaskGrantSignature, false);
    assert.equal(manual.offchain.task, null);

    for (const t of ev.transfers) assert.deepEqual(t.checks, { sentByOnChainAgent: true, recipientAllowlisted: true, withinPerTxCap: true, withinDailyCap: true });
    const kinds = ev.transactions.map((t) => t.kind);
    assert.ok(kinds.some((k) => k.includes('RecipientUpdated')), 'owner configuration transactions are included');
    assert.ok(ev.transactions.filter((t) => t.kind === 'TransferExecuted').every((t) => t.fromRole === 'agent'));

    const md = fs.readFileSync(path.join(out, 'EVIDENCE.md'), 'utf8');
    assert.match(md, /\*\*1 autonomous\*\*/);
    assert.match(md, new RegExp(txAutonomous.slice(0, 10)));
    assert.ok(fs.existsSync(path.join(out, 'evidence.json')));
  });

  test('without a database it still reports chain evidence and marks authorization unknown', async () => {
    const ev = await collectEvidence({ deployment: deploymentFile, rpc: chain.rpcUrl, db: null, out: false });
    assert.equal(ev.summary.agentTransfers, 2);
    assert.ok(ev.transfers.every((t) => t.authorization.startsWith('UNKNOWN')));
    assert.equal(ev.summary.auditLog, null);
  });

  test('recognizes an Ethereum Sepolia deployment record and still refuses a mismatched RPC', async () => {
    const sep = path.join(path.dirname(dbDir), 'sepolia.json');
    fs.writeFileSync(sep, JSON.stringify({ ...fx.deployment, chainId: 11155111 }));
    await assert.rejects(collectEvidence({ deployment: sep, rpc: chain.rpcUrl, db: null, out: false }), /RPC is on chain 31337, deployment is for 11155111/);
  });

  test('refuses an RPC on a different chain than the deployment record', async () => {
    const wrong = path.join(path.dirname(dbDir), 'wrong-chain.json');
    fs.writeFileSync(wrong, JSON.stringify({ ...fx.deployment, chainId: 84532 }));
    await assert.rejects(collectEvidence({ deployment: wrong, rpc: chain.rpcUrl, db: null, out: false }), /RPC is on chain 31337, deployment is for 84532/);
  });
});
