#!/usr/bin/env node
/**
 * Read-only, independent verification of the 11 public Ethereum Sepolia transactions of the AgentWallet run.
 *
 *   node submission/tools/verify-receipts.mjs [--json out.json] [--rpc URL]
 *
 * For each hash in evidence/sepolia/timeline.json it fetches the transaction, its receipt and its block from a
 * public RPC, decodes AgentWallet events with the compiled ABI, and prints status, block, sender, target, method
 * and events. No key is loaded and nothing is signed or sent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { ethers } = createRequire(path.join(ROOT, 'backend', 'package.json'))('ethers');
const args = process.argv.slice(2);
const opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const RPC = opt('--rpc', 'https://ethereum-sepolia-rpc.publicnode.com');
const timeline = JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence', 'sepolia', 'timeline.json'), 'utf8'));
const evidence = JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence', 'sepolia', 'evidence.json'), 'utf8'));
// The public run used AgentWallet v1. Its ABI and bytecode are frozen in shared/abi/AgentWallet.v1.json, so this
// verifier keeps working after contracts/ is rebuilt as v2.
const v1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'abi', 'AgentWallet.v1.json'), 'utf8'));
const abi = v1.abi;
const iface = new ethers.Interface(abi);
const CONTRACT = ethers.getAddress(evidence.contract.address);
const ROLES = {
  [ethers.getAddress('0x10A0d3247a1446fD30ba40D14e4272206278b5ba')]: 'owner',
  [ethers.getAddress('0x30D53BD30B6D60E7c49829D6Df79b5B7E4CBBD1D')]: 'agent',
  [ethers.getAddress('0x80D4101A23062ee7E5B2477D4C036AB0FD4e2a67')]: 'deployer',
  [ethers.getAddress('0x82446B165d0d55051af76e3aD7852B0F3141904e')]: 'recipient',
  [CONTRACT]: 'AgentWallet',
};
const who = (a) => (a ? `${ROLES[ethers.getAddress(a)] || 'other'} ${ethers.getAddress(a)}` : '(contract creation)');
const c = { dim: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', x: '\x1b[0m' };
const provider = new ethers.JsonRpcProvider(RPC, 11155111, { staticNetwork: true });

console.log(`${c.b}Ethereum Sepolia receipt verification (read-only, ${new URL(RPC).host})${c.x}`);
console.log(`${c.dim}chain ${(await provider.getNetwork()).chainId} · contract ${CONTRACT} · ${timeline.transactions.length} transactions${c.x}\n`);
const out = [];
let allOk = true;
for (const [i, t] of timeline.transactions.entries()) {
  const [tx, rc] = await Promise.all([provider.getTransaction(t.hash), provider.getTransactionReceipt(t.hash)]);
  const block = await provider.getBlock(rc.blockNumber);
  let method = tx.to ? (tx.data === '0x' ? 'ETH transfer (no calldata)' : null) : 'contract creation';
  if (!method) { try { method = iface.parseTransaction({ data: tx.data, value: tx.value }).signature; } catch { method = tx.data.slice(0, 10); } }
  const events = rc.logs.filter((l) => ethers.getAddress(l.address) === CONTRACT).map((l) => {
    try { const p = iface.parseLog(l); return { name: p.name, args: Object.fromEntries(p.fragment.inputs.map((inp, k) => [inp.name, String(p.args[k])])) }; } catch { return { name: 'unknown', topic0: l.topics[0] }; }
  });
  const ok = rc.status === 1;
  allOk &&= ok;
  const row = {
    n: i + 1, label: t.label, hash: t.hash, status: ok ? 'SUCCESS' : 'REVERTED', blockNumber: rc.blockNumber,
    timestampUtc: new Date(block.timestamp * 1000).toISOString(), from: ethers.getAddress(tx.from), fromRole: ROLES[ethers.getAddress(tx.from)] || 'other',
    to: tx.to ? ethers.getAddress(tx.to) : null, toRole: tx.to ? ROLES[ethers.getAddress(tx.to)] || 'other' : null,
    contractCreated: rc.contractAddress || null, valueEth: ethers.formatEther(tx.value), method, gasUsed: rc.gasUsed.toString(), events,
    etherscan: t.etherscan, blockscout: t.blockscout,
  };
  out.push(row);
  console.log(`${ok ? `${c.g}✓ SUCCESS` : `${c.r}✗ REVERTED`}${c.x}  ${c.b}${String(i + 1).padStart(2)}. ${t.label}${c.x}`);
  console.log(`   hash   ${t.hash}`);
  console.log(`   block  ${rc.blockNumber} · ${row.timestampUtc.replace('T', ' ').slice(0, 19)} UTC · gas ${row.gasUsed}`);
  console.log(`   from   ${who(tx.from)}`);
  console.log(`   to     ${rc.contractAddress ? `${c.y}created ${rc.contractAddress}${c.x}` : who(tx.to)}${Number(row.valueEth) ? ` · ${row.valueEth} ETH` : ''}`);
  console.log(`   call   ${method}${events.length ? `  →  ${events.map((e) => e.name).join(', ')}` : ''}\n`);
}
const code = await provider.getCode(CONTRACT);
const live = new ethers.Contract(CONTRACT, abi, provider);
const state = { paused: await live.paused(), agent: await live.agent(), owner: await live.owner(), bytecodeBytes: (code.length - 2) / 2, matchesFrozenV1: code.toLowerCase() === v1.deployedBytecode.toLowerCase() };
console.log(`${c.b}Contract state now:${c.x} paused=${state.paused} · agent=${state.agent} · owner=${who(state.owner)} · ${state.bytecodeBytes} bytes of code · runtime ${state.matchesFrozenV1 ? 'identical to' : 'DIFFERENT from'} frozen v1`);
console.log(allOk ? `\n${c.g}${c.b}ALL ${out.length} TRANSACTIONS SUCCESSFUL ON-CHAIN${c.x}` : `\n${c.r}${c.b}NOT ALL TRANSACTIONS SUCCEEDED${c.x}`);
const json = opt('--json', null);
if (json) fs.writeFileSync(path.resolve(json), JSON.stringify({ verifiedAt: new Date().toISOString(), rpc: RPC, chainId: 11155111, contract: CONTRACT, contractStateNow: state, transactions: out }, null, 2));
provider.destroy();
process.exit(allOk && state.matchesFrozenV1 ? 0 : 1);
