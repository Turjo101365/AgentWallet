#!/usr/bin/env node
/**
 * Deliverable 06: the full public-testnet evidence sequence, automated end to end.
 *
 *   node scripts/base-sepolia-run.mjs [--network base-sepolia|sepolia] --plan   # read-only budget (default: base-sepolia)
 *   node scripts/base-sepolia-run.mjs --rehearse   # same sequence on a throwaway local Hardhat chain, throwaway keys
 *   node scripts/base-sepolia-run.mjs --network sepolia --execute --i-approve-sepolia-transactions
 *   node scripts/base-sepolia-run.mjs --execute --i-approve-base-sepolia-transactions
 *                                                  # both also need CONFIRM_PUBLIC_DEPLOY=yes in contracts/.env
 *
 * Sequence:
 *  1. Owner tops up the deployer and agent.
 *  2. Deployer deploys AgentWallet(owner, agent, caps).
 *  3. Owner allowlists the recipient and deposits.
 *  4. The backend starts with the separate Base Sepolia profile.
 *  5. The owner signs in (SIWE) and approves one transfer with EIP-712.
 *  6. A transfer above the cap is drafted: POLICY_REJECTED, nothing sent.
 *  7. The owner signs a task grant; the scheduler executes one transfer autonomously.
 *  8. Owner pause/unpause, emergencyStop, and withdrawal of the remainder.
 *  9. Read-only evidence collection.
 *
 * Keys come from git-ignored files (contracts/.env, backend/.env.base-sepolia,
 * secrets/base-sepolia-wallets.env) and are never printed. Value can only move between the four
 * roles and the contract, and every amount is checked against a hard ceiling before sending.
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(path.join(ROOT, 'backend', 'package.json'));
const { ethers } = req('ethers');
const dotenv = req('dotenv');
const E = ethers.parseEther;
const fmt = (wei) => `${ethers.formatEther(wei)} ETH`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let logSink = (m) => console.log(`[run] ${m}`);
const log = (m) => logSink(m);
/** Lets a caller (the recorded demo) mirror run output somewhere else, e.g. an on-screen log. */
export function setLogger(fn) { logSink = fn; }

/** Amounts for the whole sequence. Sized for faucet funding; caps are what the contract enforces. */
export const PLAN = Object.freeze({
  perTxCap: E('0.0002'),
  dailyCap: E('0.0005'),
  deposit: E('0.0004'),
  approvedTransfer: '0.0001',
  rejectedTransfer: '0.0003', // above the per-tx cap: must be POLICY_REJECTED, never sent
  autonomousTransfer: '0.0001',
  agentMinBalance: E('0.0002'), // backend MIN_EXECUTOR_GAS_BALANCE_ETH in the Base Sepolia profile
  hardCeiling: E('0.001'), // no deposit or payment from this script may move more
  // No top-up of the deployer or agent (gas money between our own keys) may exceed this. 0.015 since 2026-10-17 (approved):
  // the larger v2 deploy needs a ~0.0123 ETH upfront gas reservation at the 0.5 gwei Sepolia floor.
  gasMoneyCeiling: E('0.015'),
});

// Local Hardhat gas, scaled to the chain by the deploy estimate ratio. `executeTransfer` is the agent's transfer call:
// v2's signed executeGrantTransfer measured 143,389 locally (v2 executeApprovedTransfer 109,277; v1 93,869).
const GAS = { deploy: 2_100_000n, setRecipient: 50_000n, deposit: 30_000n, transfer: 21_000n, executeTransfer: 150_000n, revokeGrant: 50_000n, pause: 50_000n, unpause: 30_000n, emergencyStop: 55_000n, withdraw: 40_000n };
const OWNER_TXS = ['transfer', 'transfer', 'setRecipient', 'deposit', 'revokeGrant', 'pause', 'unpause', 'emergencyStop', 'withdraw'];
const ARTIFACT = path.join(ROOT, 'contracts', 'artifacts', 'src', 'AgentWallet.sol', 'AgentWallet.json');
const GAS_ORACLE = '0x420000000000000000000000000000000000000F'; // OP-stack GasPriceOracle predeploy (Base)

/** Public testnets this script may target. Each has its own backend profile, database, deployment and evidence. */
export const TARGETS = Object.freeze({
  'base-sepolia': Object.freeze({ chainId: 84532, name: 'Base Sepolia', rpc: 'https://sepolia.base.org', profile: 'backend/.env.base-sepolia', deployment: 'contracts/deployments/base_sepolia.json', db: 'backend/data/base-sepolia', evidence: 'evidence/base-sepolia', apiPort: 4100, record: 'base_sepolia', l1Fee: true }),
  // The completed v1 public run (2026-10-16). FROZEN: its deployment record, database and evidence are the v1 evidence
  // and must never be written again, so this target can still --plan but refuses --execute.
  sepolia: Object.freeze({ chainId: 11155111, name: 'Ethereum Sepolia (v1, frozen)', rpc: 'https://ethereum-sepolia-rpc.publicnode.com', profile: 'backend/.env.sepolia', deployment: 'contracts/deployments/sepolia.json', db: 'backend/data/sepolia', evidence: 'evidence/sepolia', apiPort: 4200, record: 'sepolia', l1Fee: false, frozen: true }),
  // Contract v2 on Ethereum Sepolia: same chain and keys, its own deployment record, database and evidence.
  'sepolia-v2': Object.freeze({ chainId: 11155111, name: 'Ethereum Sepolia (contract v2)', rpc: 'https://ethereum-sepolia-rpc.publicnode.com', profile: 'backend/.env.sepolia', deployment: 'contracts/deployments/sepolia-v2.json', db: 'backend/data/sepolia-v2', evidence: 'evidence/sepolia-v2', apiPort: 4201, record: 'sepolia-v2', l1Fee: false, contractVersion: 2 }),
});

/** Paths of the v1 public run. No run may write to them again (checked before anything is sent). */
export const PROTECTED_V1_PATHS = Object.freeze(['contracts/deployments/sepolia.json', 'backend/data/sepolia', 'evidence/sepolia', 'evidence/sepolia-attempt-1']);

/**
 * Refuses an --execute that could touch the v1 evidence or mix contract versions. Pure apart from reading the evidence
 * folder, so it is unit-tested. Throws on: a frozen target; any target path inside a protected v1 path; an evidence
 * folder that already holds files (a finished run is never overwritten); an artifact whose VERSION differs.
 */
export function assertTargetSafe(targetName, { root = ROOT, artifactVersion } = {}) {
  const target = TARGETS[targetName];
  if (!target) throw new Error(`Unknown target ${targetName}`);
  if (target.frozen) throw new Error(`${target.name}: this target is frozen (completed public run); use --network sepolia-v2`);
  const norm = (p) => path.posix.normalize(String(p).split('\\').join('/')).replace(/\/$/, '');
  for (const key of ['deployment', 'db', 'evidence']) {
    const p = norm(target[key]);
    for (const prot of PROTECTED_V1_PATHS) if (p === prot || p.startsWith(`${prot}/`)) throw new Error(`${targetName}.${key} (${p}) is inside protected v1 path ${prot}`);
  }
  const ev = path.join(root, target.evidence);
  if (fs.existsSync(ev) && fs.readdirSync(ev).length) throw new Error(`${target.evidence} already holds a run; refusing to overwrite it`);
  if (target.contractVersion && artifactVersion !== undefined && Number(artifactVersion) !== target.contractVersion) {
    throw new Error(`Compiled AgentWallet is v${artifactVersion}, target expects v${target.contractVersion}`);
  }
  return target;
}

/** VERSION() of the compiled artifact (v1 has none). */
export function artifactVersion() {
  const { abi } = JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'));
  return abi.some((f) => f.type === 'function' && f.name === 'VERSION') ? 2 : 1;
}
const RECORD_NAME = Object.fromEntries(Object.values(TARGETS).filter((t) => !t.frozen).map((t) => [t.chainId, t.record]));

export function readKeys(target = TARGETS['base-sepolia']) {
  const parse = (f) => (fs.existsSync(path.join(ROOT, f)) ? dotenv.parse(fs.readFileSync(path.join(ROOT, f))) : {});
  const c = parse('contracts/.env');
  const b = parse(target.profile);
  const s = parse('secrets/base-sepolia-wallets.env');
  const wallet = (key, name) => {
    if (!/^0x[0-9a-fA-F]{64}$/.test(key || '')) throw new Error(`${name} key missing`);
    return new ethers.Wallet(key);
  };
  return {
    env: { contracts: c, backend: b },
    keys: {
      deployer: wallet(c.DEPLOYER_PRIVATE_KEY, 'Deployer (contracts/.env)'),
      agent: wallet(b.AGENT_PRIVATE_KEY, `Agent (${target.profile})`),
      owner: wallet(s.OWNER_PRIVATE_KEY, 'Owner (secrets/base-sepolia-wallets.env)'),
      recipient: wallet(s.RECIPIENT_PRIVATE_KEY, 'Recipient (secrets/base-sepolia-wallets.env)'),
    },
  };
}

export function checkRoles(keys) {
  const addrs = Object.values(keys).map((w) => w.address);
  if (new Set(addrs).size !== 4) throw new Error('Deployer, agent, owner and recipient must be four different keys');
  const hardhat = new Set(Array.from({ length: 20 }, (_, i) => ethers.HDNodeWallet.fromPhrase('test test test test test test test test test test test junk', undefined, `m/44'/60'/0'/0/${i}`).address));
  for (const [role, w] of Object.entries(keys)) if (hardhat.has(w.address)) throw new Error(`${role} is a public Hardhat key`);
}

/**
 * Minimum gas price assumed per chain. At near-zero fees (Sepolia ~20 wei on 2026-10-16) the price swings
 * several-fold between budgeting and sending, so "live × 3" alone under-funds: the first public attempt
 * was refused for exactly this ("have 245700000 want 618912545"). Unused gas money stays in our own keys.
 */
export const MIN_GAS_PRICE_WEI = Object.freeze({ 11155111: 500_000_000n, 84532: 20_000_000n });

/** Budget per role, from max(live gas price × 3, the chain's floor) plus the L1 data fee where the chain charges one. */
export async function budget(provider, keys) {
  const fee = await provider.getFeeData();
  const { chainId: cid } = await provider.getNetwork();
  const live = (fee.maxFeePerGas || fee.gasPrice) * 3n;
  const floor = MIN_GAS_PRICE_WEI[Number(cid)] || 0n;
  const price = live > floor ? live : floor;
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'));
  const deployData = new ethers.ContractFactory(artifact.abi, artifact.bytecode).interface.encodeDeploy([keys.owner.address, keys.agent.address, PLAN.perTxCap, PLAN.dailyCap]);
  // The sender must hold gasLimit × maxFee upfront, and ethers uses the node's estimate as the gas limit.
  // Ethereum Sepolia estimated this deployment at 14,393,315 gas on 2026-10-16 (2,075,676 on Hardhat), so
  // budget from the live estimate (+20%) and scale the locally measured call costs by the same ratio.
  let deployGas = GAS.deploy;
  if (typeof provider.estimateGas === 'function') {
    try { deployGas = await provider.estimateGas({ from: keys.deployer.address, data: artifact.bytecode + deployData.slice(2) }); } catch { /* keep the local figure */ }
  }
  const scale = deployGas > GAS.deploy ? deployGas : GAS.deploy; // ratio numerator; denominator GAS.deploy
  const g = (name) => (GAS[name] * scale) / GAS.deploy;
  let l1Deploy = 0n;
  let l1PerTx = 0n;
  const { chainId } = await provider.getNetwork();
  if (chainId === 84532n) {
    const oracle = new ethers.Contract(GAS_ORACLE, ['function getL1Fee(bytes) view returns (uint256)'], provider);
    const unsigned = (data) => ethers.Transaction.from({ type: 2, chainId, nonce: 1, gasLimit: GAS.deploy, maxFeePerGas: price, maxPriorityFeePerGas: fee.maxPriorityFeePerGas || 1n, data, value: 0 }).unsignedSerialized;
    l1Deploy = ((await oracle.getL1Fee(unsigned(artifact.bytecode + deployData.slice(2)))) * 3n) / 2n;
    l1PerTx = ((await oracle.getL1Fee(unsigned('0x' + 'ab'.repeat(100)))) * 3n) / 2n;
  }
  const deployer = ((deployGas * 12n) / 10n) * price + l1Deploy;
  const agent = PLAN.agentMinBalance + 2n * (g('executeTransfer') * price + l1PerTx);
  const ownerGas = OWNER_TXS.reduce((s, t) => s + g(t) * price + l1PerTx, 0n);
  const owner = PLAN.deposit + ownerGas;
  return { gasPriceWei: (fee.maxFeePerGas || fee.gasPrice), budgetGasPriceWei: price, deployGasEstimate: deployGas, callGasScale: Number(scale) / Number(GAS.deploy), l1Deploy, l1PerTx, deployer, agent, owner, totalToFundOwner: owner + deployer + agent };
}

export async function send(label, txPromise, confirmations) {
  const tx = await txPromise;
  const receipt = await tx.wait(confirmations);
  if (receipt.status !== 1) throw new Error(`${label} reverted (${tx.hash})`);
  log(`${label}: ${tx.hash} (block ${receipt.blockNumber})`);
  return receipt;
}

export const RECIPIENT_LABEL = 'Evidence recipient';
export const ARTIFACT_PATH = ARTIFACT;

/** Refuses to sign anything whose draft differs from what was asked for (the owner's own check). */
export function checkDraft(what, actual, expected) {
  for (const [k, v] of Object.entries(expected)) {
    const a = typeof v === 'string' && v.startsWith('0x') ? String(actual[k]).toLowerCase() : String(actual[k]);
    const e = typeof v === 'string' && v.startsWith('0x') ? v.toLowerCase() : String(v);
    if (a !== e) throw new Error(`Refusing to sign the ${what}: ${k} is ${actual[k]}, expected ${v}`);
  }
}

/** One AI-agent turn that must produce exactly one action of the given type. Returns its id and tool log. */
async function agentTurn(api, message, type) {
  const turn = await api('POST', '/agent/chat', { message });
  const actions = (turn.actions || []).filter((a) => a.type === type);
  if (turn.status !== 'COMPLETED' || actions.length !== 1) {
    throw new Error(`AI agent turn ended ${turn.status} with ${actions.length} ${type} action(s): ${String(turn.text || turn.error || '').slice(0, 200)}`);
  }
  const conv = await api('GET', `/agent/conversations/${turn.conversationId}`);
  const tools = conv.turns.find((t) => t.id === turn.turnId).toolInvocations.map((i) => `${i.tool}:${i.status}`);
  log(`AI agent (${conv.turns.at(-1).provider} ${conv.turns.at(-1).model || ''}): "${message}" -> ${tools.join(', ')}`);
  return { actionId: actions[0].id, conversationId: turn.conversationId, turnId: turn.turnId, tools };
}

export function guardValue(to, value, allowed, ceiling = PLAN.hardCeiling) {
  if (value > ceiling) throw new Error(`Refusing to send ${fmt(value)}: above the ${fmt(ceiling)} ceiling`);
  if (!allowed.has(ethers.getAddress(to))) throw new Error(`Refusing to send to ${to}: not one of the four roles or the contract`);
}

/** Steps 1–2: the owner tops up the deployer and agent, then the deployer deploys (or an existing record is reused). */
export async function topUpAndDeploy({ provider, keys, w, owner, need, allowed, deploymentFile, chainId, confirmations, steps, expectVersion = null }) {
  // 1. Owner tops up deployer and agent (single faucet target).
  for (const role of ['deployer', 'agent']) {
    const bal = await provider.getBalance(keys[role].address);
    const deployed = role === 'deployer' && fs.existsSync(deploymentFile);
    if (!deployed && bal < need[role]) {
      guardValue(keys[role].address, need[role] - bal, allowed, PLAN.gasMoneyCeiling);
      const r = await send(`Top up ${role}`, owner.sendTransaction({ to: keys[role].address, value: need[role] - bal }), confirmations);
      steps.push({ step: `top-up ${role}`, tx: r.hash });
    }
  }

  // 2. Deploy (skipped when a deployment record with code already exists, so the run can resume).
  let record = fs.existsSync(deploymentFile) ? JSON.parse(fs.readFileSync(deploymentFile, 'utf8')) : null;
  if (record && (await provider.getCode(record.contractAddress)) === '0x') throw new Error(`${deploymentFile} points at an address without code`);
  if (record && expectVersion) {
    // Resuming is only allowed onto a contract of the expected version (never onto the frozen v1 deployment).
    const v = await new ethers.Contract(record.contractAddress, ['function VERSION() view returns (uint256)'], provider).VERSION().then(Number, () => 1);
    if (v !== expectVersion) throw new Error(`${deploymentFile} points at an AgentWallet v${v}; this run needs v${expectVersion}`);
  }
  if (!record) {
    const artifact = JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'));
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, w.deployer);
    const contract = await factory.deploy(keys.owner.address, keys.agent.address, PLAN.perTxCap, PLAN.dailyCap);
    const receipt = await contract.deploymentTransaction().wait(confirmations);
    record = {
      network: RECORD_NAME[chainId] || 'rehearsal',
      chainId,
      contractAddress: await contract.getAddress(),
      contractVersion: artifactVersion(),
      deployBlock: receipt.blockNumber,
      deployTxHash: receipt.hash,
      owner: keys.owner.address,
      agent: keys.agent.address,
      tokens: [{ symbol: 'ETH', address: ethers.ZeroAddress, decimals: 18, native: true }],
      demoRecipients: [{ label: 'Evidence recipient (team test wallet)', category: 'supplier', address: keys.recipient.address }],
      priceFeeds: [],
      deployedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(deploymentFile), { recursive: true });
    fs.writeFileSync(deploymentFile, JSON.stringify(record, null, 2) + '\n');
    log(`Deployed AgentWallet ${record.contractAddress}: ${receipt.hash}`);
    steps.push({ step: 'deploy', tx: receipt.hash });
  }
  return record;
}

/** Runs the whole sequence against `rpcUrl`. Used unchanged by --rehearse (local) and --execute (84532 or 11155111). */
export async function runSequence({ rpcUrl, chainId, keys, deploymentFile, profile, apiPort, dbDir, evidenceOut, confirmations = 1, schedulerTickMs, llm = {}, expectVersion = null }) {
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
  const w = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v.connect(provider)]));
  const owner = new ethers.NonceManager(w.owner);
  const steps = [];
  let backend = null;
  try {
    if (Number(await provider.send('eth_chainId', [])) !== chainId) throw new Error(`RPC is not chain ${chainId}`);
    const need = await budget(provider, keys);
    const allowed = new Set(Object.values(keys).map((k) => k.address));

    const record = await topUpAndDeploy({ provider, keys, w, owner, need, allowed, deploymentFile, chainId, confirmations, steps, expectVersion });
    allowed.add(ethers.getAddress(record.contractAddress));
    const artifact = JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'));
    const wallet = new ethers.Contract(record.contractAddress, artifact.abi, owner);

    // 3. Owner configuration.
    if (!(await wallet.isRecipientAllowed(keys.recipient.address))) {
      steps.push({ step: 'allowlist recipient', tx: (await send('Allowlist recipient', wallet.setRecipient(keys.recipient.address, true), confirmations)).hash });
    }
    const held = await provider.getBalance(record.contractAddress);
    if (held < PLAN.deposit) {
      guardValue(record.contractAddress, PLAN.deposit - held, allowed);
      steps.push({ step: 'deposit', tx: (await send('Deposit', wallet.deposit({ value: PLAN.deposit - held }), confirmations)).hash });
    }

    // 4. Backend with the separate profile (+ per-run overrides). It loads nothing from backend/.env.
    backend = await startBackend({ profile, apiPort, dbDir, deploymentFile, rpcUrl, chainId, schedulerTickMs, llm });
    const api = backend.api;

    // 5. Owner signs in and approves one transfer with EIP-712.
    const { message } = await api('POST', '/auth/nonce', { address: keys.owner.address });
    const { token } = await api('POST', '/auth/verify', { message, signature: await keys.owner.signMessage(message) });
    api.token = token;
    // With an LLM configured, the AI agent drafts the transfers below; the owner signs only after the
    // draft is checked field by field, exactly as a human would check it in MetaMask.
    const useAgent = Boolean(llm.LLM_PROVIDER);
    if (useAgent) await api('PUT', `/recipients/${keys.recipient.address}/label`, { label: RECIPIENT_LABEL, category: 'supplier' });
    let p1;
    if (useAgent) {
      const turn = await agentTurn(api, `Send ${PLAN.approvedTransfer} ETH to my approved recipient "${RECIPIENT_LABEL}".`, 'proposal');
      p1 = await api('GET', `/proposals/${turn.actionId}`);
      steps.push({ step: 'AI agent drafted transfer', conversation: turn.conversationId, turn: turn.turnId, proposal: p1.id, tools: turn.tools });
    } else {
      p1 = await api('POST', '/proposals', { token: ethers.ZeroAddress, recipient: keys.recipient.address, amount: PLAN.approvedTransfer, memo: 'Deliverable 06: owner-approved transfer' });
    }
    checkDraft('transfer', { status: p1.status, token: p1.token.address, recipient: p1.recipient, amountWei: p1.amountWei }, { status: 'AWAITING_APPROVAL', token: ethers.ZeroAddress, recipient: keys.recipient.address, amountWei: E(PLAN.approvedTransfer).toString() });
    const { domain, types, message: typed } = p1.approvalTypedData;
    await api('POST', `/proposals/${p1.id}/approve`, { signature: await keys.owner.signTypedData(domain, types, typed) }, { 'Idempotency-Key': crypto.randomUUID() });
    const done1 = await waitFor(async () => { const x = await api('GET', `/proposals/${p1.id}`); return ['CONFIRMED', 'FAILED'].includes(x.status) ? x : null; }, 240000);
    if (done1.status !== 'CONFIRMED') throw new Error(`Owner-approved transfer ${done1.status}`);
    log(`Owner-approved transfer: ${done1.execution.txHash}`);
    steps.push({ step: 'owner-approved transfer', tx: done1.execution.txHash, proposal: p1.id });

    // 6. Policy rejection: above the per-tx cap, so it is rejected off-chain and never sent.
    const p2 = await api('POST', '/proposals', { token: ethers.ZeroAddress, recipient: keys.recipient.address, amount: PLAN.rejectedTransfer, memo: 'Deliverable 06: must be rejected (above cap)' });
    if (p2.status !== 'POLICY_REJECTED') throw new Error(`Over-cap draft was ${p2.status}, expected POLICY_REJECTED`);
    log(`Over-cap draft rejected by policy: ${p2.policyResult.violations.map((v) => v.id).join(', ')}`);
    steps.push({ step: 'policy rejection (no tx)', proposal: p2.id, violations: p2.policyResult.violations.map((v) => v.id) });

    // 7. Autonomous run under an owner-signed grant and a matching auto-approval limit.
    await api('PUT', '/policy', { autoApprovalMaxPerTx: { [ethers.ZeroAddress]: E(PLAN.autonomousTransfer).toString() }, confirmLoosening: true });
    const now = Math.floor(Date.now() / 1000);
    let task;
    if (useAgent) {
      const at = new Date((now + 150) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const turn = await agentTurn(api, `Schedule a one-time payment of ${PLAN.autonomousTransfer} ETH to my approved recipient "${RECIPIENT_LABEL}" at ${at}, valid for 1 day.`, 'task');
      task = await api('GET', `/tasks/${turn.actionId}`);
      steps.push({ step: 'AI agent drafted scheduled payment', conversation: turn.conversationId, turn: turn.turnId, task: task.id, tools: turn.tools });
    } else {
      task = await api('POST', '/tasks', { token: ethers.ZeroAddress, recipient: keys.recipient.address, amount: PLAN.autonomousTransfer, title: 'Deliverable 06 autonomous payment', schedule: { type: 'once', at: now + 20 }, maxRuns: 1, validUntil: now + 3600 });
    }
    checkDraft('scheduled payment', { status: task.status, token: task.token.address, recipient: task.recipient, amountWei: task.amountWei, schedule: task.schedule.type, runs: task.maxRuns ?? 1 }, { status: 'PENDING_AUTHORIZATION', token: ethers.ZeroAddress, recipient: keys.recipient.address, amountWei: E(PLAN.autonomousTransfer).toString(), schedule: 'once', runs: 1 });
    const g = task.grantTypedData;
    await api('POST', `/tasks/${task.id}/authorize`, { signature: await keys.owner.signTypedData(g.domain, g.types, g.message) });
    const run = await waitFor(async () => { const t = await api('GET', `/tasks/${task.id}`); const r = t.runs?.[0]; return r && ['CONFIRMED', 'FAILED', 'ESCALATED'].includes(r.status) ? r : null; }, 300000);
    if (run.status !== 'CONFIRMED') throw new Error(`Autonomous run ended ${run.status}: ${run.errorMessage || ''}`);
    const p3 = await api('GET', `/proposals/${run.proposalId}`);
    if (p3.approvalKind !== 'TASK_GRANT') throw new Error(`Autonomous transfer approval kind is ${p3.approvalKind}`);
    log(`Autonomous transfer (task grant, no per-transfer owner signature): ${p3.execution.txHash}`);
    steps.push({ step: 'autonomous transfer', tx: p3.execution.txHash, task: task.id, proposal: p3.id });

    // 7b. v2 only: the owner signs a second (recurring) grant and revokes it ON-CHAIN; the agent can no longer use it.
    if (Number(await wallet.VERSION().catch(() => 1)) >= 2) {
      const t2 = await api('POST', '/tasks', { token: ethers.ZeroAddress, recipient: keys.recipient.address, amount: PLAN.autonomousTransfer, title: 'Grant revoked on-chain (evidence)', schedule: { type: 'weekly', weekday: 1, hour: 9, minute: 0 }, maxRuns: 4, validUntil: now + 7 * 86400 });
      const g2 = t2.grantTypedData;
      const sig2 = await keys.owner.signTypedData(g2.domain, g2.types, g2.message);
      await api('POST', `/tasks/${t2.id}/authorize`, { signature: sig2 });
      const digest = ethers.TypedDataEncoder.hash(g2.domain, g2.types, g2.message);
      if (digest !== (await wallet.grantDigest(g2.message))) throw new Error('Contract grant digest differs from the signed typed data');
      steps.push({ step: 'revoke grant', tx: (await send('Revoke grant on-chain', wallet.revokeGrant(digest), confirmations)).hash, task: t2.id, grantDigest: digest });
      await api('POST', `/tasks/${t2.id}/cancel`, { reason: 'Grant revoked on-chain by owner' });
      let probe = null;
      // Read-only probe AS the agent: a provider-connected contract (the owner's signer would refuse from = agent).
      const asReader = wallet.connect(provider);
      try { await asReader.executeGrantTransfer.staticCall(g2.message, sig2, ethers.id(`probe:${t2.id}`), { from: keys.agent.address }); probe = 'ACCEPTED'; } catch (err) { try { probe = wallet.interface.parseError(err.data)?.name || 'reverted'; } catch { probe = 'reverted'; } }
      if (probe !== 'GrantIsRevoked') throw new Error(`Agent probe of the revoked grant returned ${probe}`);
      log(`Grant ${digest.slice(0, 10)}… revoked on-chain; agent eth_call probe → ${probe} (nothing sent)`);
      steps.push({ step: 'probe: agent uses the revoked grant (eth_call, nothing sent)', result: probe, grantDigest: digest });
    }

    // 8. Emergency controls, then return the remainder to the owner.
    steps.push({ step: 'pause', tx: (await send('Pause', wallet.pause(), confirmations)).hash });
    steps.push({ step: 'unpause', tx: (await send('Unpause', wallet.unpause(), confirmations)).hash });
    steps.push({ step: 'emergencyStop', tx: (await send('Emergency stop', wallet.emergencyStop(), confirmations)).hash });
    const left = await provider.getBalance(record.contractAddress);
    if (left > 0n) steps.push({ step: 'withdraw remainder', tx: (await send(`Withdraw ${fmt(left)}`, wallet.withdraw(ethers.ZeroAddress, keys.owner.address, left), confirmations)).hash });

    await backend.stop();
    backend = null;

    // 9. Evidence (read-only).
    const { collectEvidence } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'collect-evidence.mjs')).href);
    const evidence = await collectEvidence({ deployment: deploymentFile, rpc: rpcUrl, db: dbDir, out: evidenceOut });
    return { steps, evidence, budget: need };
  } finally {
    if (backend) await backend.stop();
    provider.destroy();
  }
}

export async function waitFor(fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error('Timed out waiting for the backend');
    await sleep(2000);
  }
}

/**
 * Idempotent stop for a spawned child. A killed process keeps exitCode === null (signalCode is set instead),
 * and its 'exit' event fires only once, so waiting for it again would hang forever; this hung the end of the
 * first successful public run before the deployment gate was reset.
 */
export function childStopper(child) {
  const exited = new Promise((resolve) => (child.exitCode !== null || child.signalCode !== null ? resolve() : child.once('exit', () => resolve())));
  return async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  };
}

export async function startBackend({ profile, apiPort, dbDir, deploymentFile, rpcUrl, chainId, schedulerTickMs, llm }) {
  const env = { ...process.env, ...llm, AGENT_WALLET_ENV_FILE: profile, PORT: String(apiPort), PGLITE_DIR: dbDir, DEPLOYMENT_FILE: deploymentFile, RPC_URL: rpcUrl, CHAIN_ID: String(chainId), LOG_LEVEL: 'warn', ...(schedulerTickMs ? { SCHEDULER_TICK_MS: String(schedulerTickMs), INDEXER_POLL_MS: '1000' } : {}) };
  const child = spawn(process.execPath, ['src/server.js'], { cwd: path.join(ROOT, 'backend'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  const stopChild = childStopper(child);
  let out = '';
  const keep = (d) => { out = (out + d).slice(-4000); };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  const base = `http://127.0.0.1:${apiPort}/api`;
  const api = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(api.token ? { authorization: `Bearer ${api.token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${url} -> HTTP ${res.status}: ${JSON.stringify(json.error || json).slice(0, 300)}`);
    return json.data;
  };
  await waitFor(async () => {
    if (child.exitCode !== null) throw new Error(`Backend exited: ${out.replace(/0x[0-9a-fA-F]{64}/g, '0x[redacted]')}`);
    try { const c = await api('GET', '/config'); return c.chainReady ? c : null; } catch { return null; }
  }, 120000);
  return {
    api,
    stop: stopChild,
  };
}

/** LLM_* settings from backend/.env, passed to the backend in memory only (never written elsewhere). */
export function llmFromBackendEnv() {
  const file = path.join(ROOT, 'backend', '.env');
  return Object.fromEntries(Object.entries(fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {}).filter(([k]) => k.startsWith('LLM_')));
}

async function main() {
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  if (args.has('--rehearse')) return rehearse({ llm: args.has('--with-ai') ? llmFromBackendEnv() : {} });
  const targetName = argv.includes('--network') ? argv[argv.indexOf('--network') + 1] : 'base-sepolia';
  const target = TARGETS[targetName];
  if (!target) throw new Error(`Unknown --network ${targetName}; use ${Object.keys(TARGETS).join(' or ')}`);
  const { env, keys } = readKeys(target);
  checkRoles(keys);
  const rpcUrl = env.backend.RPC_URL || target.rpc;
  const provider = new ethers.JsonRpcProvider(rpcUrl, target.chainId, { staticNetwork: true });
  let need;
  try {
    if (Number(await provider.send('eth_chainId', [])) !== target.chainId) throw new Error(`${rpcUrl} is not ${target.name}`);
    need = await budget(provider, keys);
    log(`${target.name} (chain ${target.chainId}) gas price ${ethers.formatUnits(need.gasPriceWei, 'gwei')} gwei, budgeted at ${ethers.formatUnits(need.budgetGasPriceWei, 'gwei')} gwei${target.l1Fee ? `; L1 data fee est. deploy ${fmt(need.l1Deploy)}, per tx ${fmt(need.l1PerTx)}` : ''}`);
    for (const role of ['owner', 'deployer', 'agent', 'recipient']) log(`${role.padEnd(9)} ${keys[role].address}  balance ${fmt(await provider.getBalance(keys[role].address))}${need[role] ? `  needs ${fmt(need[role])}` : ''}`);
    log(`Fund ONLY the owner with ≥ ${fmt(need.totalToFundOwner)}; the run tops up the deployer and agent from it.`);
    if (!args.has('--execute')) return;
    const approval = `--i-approve-${targetName}-transactions`;
    assertTargetSafe(targetName, { artifactVersion: artifactVersion() }); // before any gate or balance check
    if (!args.has(approval) || env.contracts.CONFIRM_PUBLIC_DEPLOY !== 'yes') {
      throw new Error(`Refusing to execute: pass ${approval} AND set CONFIRM_PUBLIC_DEPLOY=yes in contracts/.env`);
    }
    const ownerBal = await provider.getBalance(keys.owner.address);
    if (ownerBal < need.totalToFundOwner) throw new Error(`Owner has ${fmt(ownerBal)}, needs ${fmt(need.totalToFundOwner)}`);
  } finally {
    provider.destroy();
  }
  const llm = llmFromBackendEnv();
  if (!llm.LLM_PROVIDER) log('No LLM configured in backend/.env: transfers will be drafted through the API instead of the AI agent.');
  const result = await runSequence({
    rpcUrl, chainId: target.chainId, keys, confirmations: 2, llm,
    deploymentFile: path.join(ROOT, target.deployment),
    profile: path.join(ROOT, target.profile),
    apiPort: target.apiPort,
    dbDir: path.join(ROOT, target.db),
    evidenceOut: path.join(ROOT, target.evidence),
    expectVersion: target.contractVersion || null,
  });
  log(`Done. Evidence: ${result.evidence.outDir}`);
}

/** Exact same sequence on a fresh local chain with throwaway keys; the owner is funded from Hardhat #0. */
/** `llm`: LLM_* env for the backend (tests pass a local stub; `--rehearse --with-ai` uses backend/.env, a paid API). */
export async function rehearse({ llm = {} } = {}) {
  const { startTestChain, devWallet } = await import(pathToFileURL(path.join(ROOT, 'backend', 'test', 'helpers', 'chain.js')).href);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-rehearsal-'));
  const chain = await startTestChain();
  try {
    // Match Base Sepolia's fee level (0.006 gwei base fee, measured 2026-10-16), so the budget math and
    // the ceilings are exercised at realistic prices. Hardhat still uses its own 1 gwei priority fee.
    await chain.send('hardhat_setNextBlockBaseFeePerGas', ['0x5b8d80']);
    await chain.send('hardhat_mine', ['0x1']);
    const keys = { deployer: ethers.Wallet.createRandom(), agent: ethers.Wallet.createRandom(), owner: ethers.Wallet.createRandom(), recipient: ethers.Wallet.createRandom() };
    checkRoles(keys);
    const need = await budget(chain.provider, keys);
    await (await devWallet(0, chain.provider).sendTransaction({ to: keys.owner.address, value: need.totalToFundOwner })).wait();
    log(`Rehearsal: local chain ${chain.rpcUrl}; owner funded with exactly the computed budget ${fmt(need.totalToFundOwner)}`);
    const profile = path.join(dir, '.env.rehearsal');
    // Same faucet-scale risk settings as backend/.env.base-sepolia, but self-contained (no local secrets
    // needed) so the rehearsal also runs on machines and CI without the real key files.
    fs.writeFileSync(profile, [
      'NODE_ENV=development', 'HOST=127.0.0.1', 'APP_ORIGIN=http://localhost:5174', 'CORS_ORIGINS=http://localhost:5174',
      'DATABASE_URL=', `AGENT_PRIVATE_KEY=${keys.agent.privateKey}`,
      `NATIVE_RESERVE_FLOOR_ETH=0.0001`, `MIN_EXECUTOR_GAS_BALANCE_ETH=${ethers.formatEther(PLAN.agentMinBalance)}`,
      'MAX_FEE_PER_GAS_GWEI=5', 'PROPOSAL_TTL_SECONDS=600', 'INDEXER_BLOCK_RANGE=200', 'RL_SERVICE_URL=http://127.0.0.1:9',
    ].join('\n') + '\n', { mode: 0o600 });
    const result = await runSequence({
      rpcUrl: chain.rpcUrl, chainId: 31337, keys, confirmations: 1, schedulerTickMs: 1000, llm,
      deploymentFile: path.join(dir, 'deployment.json'), profile, apiPort: 40000 + Math.floor(Math.random() * 2000),
      dbDir: path.join(dir, 'db'), evidenceOut: path.join(dir, 'evidence'), expectVersion: artifactVersion(),
    });
    const s = result.evidence.summary;
    log(`Rehearsal complete: ${result.steps.length} steps, ${s.transactions} contract txs, ${s.autonomous} autonomous + ${s.ownerApproved} owner-approved transfers, checks ${s.allTransfersPassedOnChainChecks ? 'all passed' : 'FAILED'}, audit ${s.auditLog?.valid ? 'valid' : 'INVALID'}`);
    log(`Owner left with ${fmt(await chain.provider.getBalance(keys.owner.address))} of ${fmt(need.totalToFundOwner)}; evidence report: ${path.join(result.evidence.outDir, 'EVIDENCE.md')}`);
    return result;
  } finally {
    await chain.stop();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[run] ${String(err.message).replace(/0x[0-9a-fA-F]{64}/g, '0x[redacted]')}`);
    process.exit(1);
  });
}
