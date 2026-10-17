import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PLAN, TARGETS, PROTECTED_V1_PATHS, MIN_GAS_PRICE_WEI, budget, guardValue, checkRoles, checkDraft, rehearse, assertTargetSafe, artifactVersion } from '../../scripts/base-sepolia-run.mjs';
import { startStubOpenAi } from './helpers/stubOpenAi.js';

// Deliverable 06 run script: its safety guards, and the complete sequence rehearsed on a throwaway
// local chain with throwaway keys and Base Sepolia's fee level (no public network is contacted).

const HARDHAT_0 = ethers.HDNodeWallet.fromPhrase('test test test test test test test test test test test junk', undefined, "m/44'/60'/0'/0/0");

describe('Base Sepolia run script', () => {
  test('value can only go to the four roles or the contract, below the ceilings', () => {
    const roles = new Set([ethers.Wallet.createRandom().address]);
    const [to] = roles;
    assert.doesNotThrow(() => guardValue(to, PLAN.hardCeiling, roles));
    assert.throws(() => guardValue(to, PLAN.hardCeiling + 1n, roles), /above the 0.001 ETH ceiling/);
    assert.throws(() => guardValue(ethers.Wallet.createRandom().address, 1n, roles), /not one of the four roles/);
    assert.throws(() => guardValue(to, PLAN.gasMoneyCeiling + 1n, roles, PLAN.gasMoneyCeiling), /above the 0.015 ETH ceiling/);
  });

  test('the v2 Sepolia target never shares a deployment record, database, evidence folder or port with the v1 run', () => {
    const v1 = TARGETS.sepolia;
    const v2 = TARGETS['sepolia-v2-full'];
    assert.equal(v1.frozen, true);
    assert.equal(TARGETS['sepolia-v2'].frozen, true, 'the first (partial) public v2 run is frozen too');
    for (const field of ['deployment', 'db', 'evidence', 'apiPort', 'record']) assert.notEqual(v2[field], TARGETS['sepolia-v2'][field], `v2-full vs first v2 run: ${field}`);
    assert.equal(v2.chainId, 11155111);
    assert.equal(v2.contractVersion, 2);
    for (const field of ['deployment', 'db', 'evidence', 'apiPort', 'record']) assert.notEqual(v2[field], v1[field], field);
    for (const key of ['deployment', 'db', 'evidence']) {
      for (const prot of PROTECTED_V1_PATHS) assert.ok(!(v2[key] === prot || v2[key].startsWith(`${prot}/`)), `${key} ${v2[key]} vs ${prot}`);
    }
  });

  test('guards: the frozen v1 target, a used evidence folder and a wrong contract version are refused before anything is sent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-guard-'));
    assert.throws(() => assertTargetSafe('sepolia', { root }), /frozen/);
    assert.throws(() => assertTargetSafe('sepolia-v2', { root }), /frozen/);
    assert.throws(() => assertTargetSafe('nope', { root }), /Unknown target/);
    assert.doesNotThrow(() => assertTargetSafe('sepolia-v2-full', { root, artifactVersion: 2 }));
    assert.throws(() => assertTargetSafe('sepolia-v2-full', { root, artifactVersion: 1 }), /expects v2/);
    fs.mkdirSync(path.join(root, 'evidence', 'sepolia-v2-full'), { recursive: true });
    assert.doesNotThrow(() => assertTargetSafe('sepolia-v2-full', { root, artifactVersion: 2 }), 'an empty folder is fine');
    fs.writeFileSync(path.join(root, 'evidence', 'sepolia-v2-full', 'EVIDENCE.md'), 'done');
    assert.throws(() => assertTargetSafe('sepolia-v2-full', { root, artifactVersion: 2 }), /already holds a run/);
    assert.equal(artifactVersion(), 2, 'the compiled contract is v2');
  });

  test('v2 deploy budget: the measured Sepolia estimate fits the 0.015 ETH gas-money ceiling at the 0.5 gwei floor', async () => {
    // eth_estimateGas on Ethereum Sepolia, 2026-10-17: v2 20,478,646 (v1 14,393,315).
    const keys = { deployer: ethers.Wallet.createRandom(), agent: ethers.Wallet.createRandom(), owner: ethers.Wallet.createRandom(), recipient: ethers.Wallet.createRandom() };
    const provider = { getFeeData: async () => ({ maxFeePerGas: 1_000_044n, gasPrice: 1_000_044n }), getNetwork: async () => ({ chainId: 11155111n }), estimateGas: async () => 20_478_646n };
    const b = await budget(provider, keys);
    assert.equal(b.budgetGasPriceWei, MIN_GAS_PRICE_WEI[11155111]);
    assert.equal(b.deployer, ((20_478_646n * 12n) / 10n) * MIN_GAS_PRICE_WEI[11155111]);
    assert.ok(b.deployer > ethers.parseEther('0.01'), 'this is why 0.01 was too low for a fresh deployer');
    assert.ok(b.deployer <= PLAN.gasMoneyCeiling, `deployer ${ethers.formatEther(b.deployer)} within ${ethers.formatEther(PLAN.gasMoneyCeiling)}`);
    assert.equal(PLAN.hardCeiling, ethers.parseEther('0.001'), 'the payment ceiling is unchanged');
  });

  test('each public target is fully separate: chain, profile, database, deployment, evidence and port', () => {
    assert.deepEqual(Object.keys(TARGETS).sort(), ['base-sepolia', 'sepolia', 'sepolia-v2', 'sepolia-v2-full']);
    assert.equal(TARGETS['base-sepolia'].chainId, 84532);
    assert.equal(TARGETS.sepolia.chainId, 11155111);
    for (const field of ['chainId', 'profile', 'deployment', 'db', 'evidence', 'apiPort', 'record']) {
      assert.notEqual(TARGETS['base-sepolia'][field], TARGETS.sepolia[field], field);
    }
    assert.equal(TARGETS['base-sepolia'].l1Fee, true);
    assert.equal(TARGETS.sepolia.l1Fee, false, 'no OP-stack L1 data fee on Ethereum L1');
    for (const t of Object.values(TARGETS)) assert.ok(![4000, 5173].includes(t.apiPort), 'never the local demo port');
  });

  test('regression (first public attempt): near-zero Sepolia gas still yields enough deployer gas money', async () => {
    // Live data from the failed attempt: ~40 wei budgeted, the deploy then wanted 618,912,545 wei.
    const keys = { deployer: ethers.Wallet.createRandom(), agent: ethers.Wallet.createRandom(), owner: ethers.Wallet.createRandom(), recipient: ethers.Wallet.createRandom() };
    const fake = (chainId) => ({ getFeeData: async () => ({ maxFeePerGas: 40n, gasPrice: 40n, maxPriorityFeePerGas: 1n }), getNetwork: async () => ({ chainId: BigInt(chainId) }) });
    const sepolia = await budget(fake(11155111), keys);
    assert.equal(sepolia.budgetGasPriceWei, MIN_GAS_PRICE_WEI[11155111]);
    assert.ok(sepolia.deployer > 618_912_545n * 100n, `deployer budget ${sepolia.deployer}`);
    assert.ok(sepolia.deployer <= PLAN.gasMoneyCeiling, 'still within the gas-money ceiling');
    const local = await budget(fake(31337), keys);
    assert.equal(local.budgetGasPriceWei, 120n, 'no floor on the local chain: live × 3');
  });

  test('regression (first public attempt): the deployer is funded for the node gas limit, not the local gas used', async () => {
    // Sepolia estimated 14,393,315 gas; the RPC demanded gasLimit × maxFee upfront (14,393,315 × 43 = 618,912,545 wei).
    const keys = { deployer: ethers.Wallet.createRandom(), agent: ethers.Wallet.createRandom(), owner: ethers.Wallet.createRandom(), recipient: ethers.Wallet.createRandom() };
    const provider = { getFeeData: async () => ({ maxFeePerGas: 43n, gasPrice: 43n }), getNetwork: async () => ({ chainId: 11155111n }), estimateGas: async () => 14_393_315n };
    const b = await budget(provider, keys);
    assert.equal(b.deployGasEstimate, 14_393_315n);
    assert.ok(b.deployer >= 14_393_315n * MIN_GAS_PRICE_WEI[11155111], 'covers the gas limit even at the floor price');
    assert.ok(b.deployer <= PLAN.gasMoneyCeiling, `deployer top-up ${b.deployer} stays under the gas-money ceiling`);
    assert.ok(b.callGasScale > 6.8, 'owner and agent call costs are scaled by the same ratio');
  });

  test('roles must be four distinct, non-public keys', () => {
    const k = () => ethers.Wallet.createRandom();
    const same = k();
    assert.doesNotThrow(() => checkRoles({ deployer: k(), agent: k(), owner: k(), recipient: k() }));
    assert.throws(() => checkRoles({ deployer: same, agent: same, owner: k(), recipient: k() }), /four different keys/);
    assert.throws(() => checkRoles({ deployer: k(), agent: k(), owner: new ethers.Wallet(HARDHAT_0.privateKey), recipient: k() }), /public Hardhat key/);
  });

  test('the owner refuses to sign a draft that differs from the request', () => {
    const want = { status: 'AWAITING_APPROVAL', recipient: '0xAbC0000000000000000000000000000000000001', amountWei: '100' };
    assert.doesNotThrow(() => checkDraft('transfer', { ...want, recipient: want.recipient.toLowerCase() }, want));
    assert.throws(() => checkDraft('transfer', { ...want, amountWei: '101' }, want), /Refusing to sign the transfer: amountWei is 101/);
    assert.throws(() => checkDraft('transfer', { ...want, recipient: '0xAbC0000000000000000000000000000000000002' }, want), /recipient/);
  });

  test('rehearsal with the AI agent: both transfers are drafted by the agent and its log is in the evidence', async () => {
    const stub = await startStubOpenAi();
    try {
      const { steps, evidence } = await rehearse({ llm: stub.llmEnv });
      assert.ok(steps.some((s) => s.step === 'AI agent drafted transfer'));
      assert.ok(steps.some((s) => s.step === 'AI agent drafted scheduled payment'));
      assert.equal(evidence.summary.aiAgentDraftedTransfers, 2);
      assert.equal(evidence.summary.allTransfersPassedOnChainChecks, true);
      for (const t of evidence.transfers) {
        const log = t.offchain.agentLog;
        assert.equal(log.provider, 'openai-compatible');
        assert.equal(log.status, 'COMPLETED');
        const tools = log.tools.map((x) => `${x.tool}:${x.status}`);
        assert.deepEqual(tools, ['list_recipients:OK', 'record_plan:OK', t.authorization === 'AUTONOMOUS' ? 'schedule_payment:OK' : 'propose_transfer:OK']);
      }
      const auto = evidence.transfers.find((t) => t.authorization === 'AUTONOMOUS');
      assert.match(auto.offchain.agentLog.userMessage, /Schedule a one-time payment/);
      assert.equal(auto.offchain.ownerSignatureOnThisTransfer, false);
    } finally {
      await stub.close();
    }
  });

  test('rehearsal: the full sequence succeeds on the computed budget and produces passing evidence', async () => {
    const { steps, evidence } = await rehearse();
    const names = steps.map((s) => s.step);
    for (const s of ['top-up deployer', 'top-up agent', 'deploy', 'allowlist recipient', 'deposit', 'owner-approved transfer', 'policy rejection (no tx)', 'autonomous transfer', 'revoke grant', 'pause', 'unpause', 'emergencyStop', 'withdraw remainder']) {
      assert.ok(names.includes(s), `missing step ${s}`);
    }
    assert.ok(steps.find((s) => s.step === 'policy rejection (no tx)').violations.includes('PER_TX_LIMIT'));
    assert.equal(evidence.summary.autonomous, 1);
    assert.equal(evidence.summary.ownerApproved, 1);
    assert.equal(evidence.summary.reverted, 0);
    assert.equal(evidence.summary.allTransfersPassedOnChainChecks, true);
    assert.equal(evidence.summary.auditLog.valid, true);
    const auto = evidence.transfers.find((t) => t.authorization === 'AUTONOMOUS');
    assert.equal(auto.offchain.ownerSignatureOnThisTransfer, false);
    assert.equal(auto.offchain.authorizedByTaskGrantSignature, true);
  });
});
