#!/usr/bin/env node
// Read-only re-verification of every recorded RELAY (AgentWallet) Ethereum Sepolia transaction. Sends nothing,
// loads no key. For each hash in evidence/reverification-2026-10-19/verified-receipts.json it fetches the
// transaction, receipt and block from a public RPC, decodes AgentWallet events with shared/abi, compares the
// status and block with the recorded values, and checks the receipt on a second RPC.
//
// Usage (from the repository root, after `npm ci --prefix backend`, which provides ethers):
//   node scripts/verify/verify-receipts.cjs [--rpc URL] [--rpc2 URL]
// Public RPCs may rate-limit; re-run or pass other endpoints. Exit code 1 if any hash disagrees.
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..');
const { ethers } = require(path.join(ROOT, 'backend', 'node_modules', 'ethers'));
const R = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const rpcs = [arg('--rpc', 'https://sepolia.drpc.org'), arg('--rpc2', 'https://1rpc.io/sepolia')];
const recorded = R('evidence/reverification-2026-10-19/verified-receipts.json');
const abiV2 = R('shared/abi/AgentWallet.json'); const abiV1 = R('shared/abi/AgentWallet.v1.json');
const ifaces = { v2: new ethers.Interface(abiV2.abi || abiV2), v1: new ethers.Interface(abiV1.abi || abiV1) };
const EVIDENCE_CONTRACT = '0x3C9389E704331B8a12381F9ab5A68a7F3F59582F';

(async () => {
  const [p, p2] = rpcs.map((u) => new ethers.JsonRpcProvider(u, 11155111, { staticNetwork: true }));
  let agree = 0;
  for (const it of recorded.transactions) {
    const [tx, rc] = await Promise.all([p.getTransaction(it.hash), p.getTransactionReceipt(it.hash)]);
    if (!tx || !rc) { console.log('NOT FOUND ', it.group, it.hash, '(try another --rpc)'); continue; }
    let rc2 = null; try { rc2 = await p2.getTransactionReceipt(it.hash); } catch { /* second RPC is optional */ }
    const iface = ifaces[it.abi] || ifaces.v2;
    const events = rc.logs.map((l) => { try { return iface.parseLog(l).name; } catch { return null; } }).filter(Boolean);
    const matches = rc.status === it.status && rc.blockNumber === it.block;
    if (matches) agree += 1;
    const second = rc2 ? (rc2.status === rc.status && rc2.blockNumber === rc.blockNumber ? 'rpc2 ok' : 'rpc2 DIFFERS') : 'rpc2 n/a';
    console.log(`${matches ? 'OK        ' : 'MISMATCH  '} ${it.group.padEnd(12)} status ${rc.status} block ${rc.blockNumber} ${second.padEnd(12)} ${events.join(',') || '-'}  ${it.hash}`);
  }
  const c = new ethers.Contract(EVIDENCE_CONTRACT, ifaces.v2, p);
  const state = { block: await p.getBlockNumber(), paused: await c.paused(), agent: await c.agent(), version: String(await c.VERSION()), balanceWei: String(await p.getBalance(EVIDENCE_CONTRACT)) };
  console.log(`\n${agree}/${recorded.transactions.length} hashes match the recorded status and block`);
  console.log('evidence contract now:', state);
  process.exit(agree === recorded.transactions.length ? 0 : 1);
})().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
