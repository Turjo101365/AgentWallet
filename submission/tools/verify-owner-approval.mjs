#!/usr/bin/env node
/**
 * Independent, read-only verification of the public run's OWNER-APPROVED transfer.
 *
 *   node submission/tools/verify-owner-approval.mjs [--tx 0x…]   (default: 0x2c83a855…2e37fb)
 *
 * 1. Copies backend/data/sepolia to a temp dir and reads the proposal executed by --tx (the original is never opened).
 * 2. Rebuilds the EIP-712 ApproveTransfer typed data from the stored proposal fields (re-implemented here, not
 *    imported from the backend) and recovers the signer from the stored owner signature.
 * 3. Reads the contract's owner() and the public receipt over a public RPC, decodes TransferExecuted, and checks
 *    that the on-chain intent, recipient and amount equal what the owner signed, and who sent the transaction.
 * 4. Checks that the same signature is recorded in the hash-chained audit log (PROPOSAL_APPROVED).
 * No key is loaded; nothing is signed or sent.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(ROOT, 'backend', 'package.json'));
const { ethers } = require('ethers');
const { PGlite } = await import(pathToFileURL(require.resolve('@electric-sql/pglite')).href);
const args = process.argv.slice(2);
const TX = (args.includes('--tx') ? args[args.indexOf('--tx') + 1] : '0x2c83a855d812b3f278720f3f5a572d358a520e4fbfd4f65fd666e77ad22e37fb').toLowerCase();
const RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const c = { d: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', x: '\x1b[0m' };
const ok = (cond, label, detail = '') => { console.log(`${cond ? `${c.g}✓` : `${c.r}✗`}${c.x} ${label}${detail ? `  ${c.d}${detail}${c.x}` : ''}`); return cond; };
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-approval-verify-'));
fs.cpSync(path.join(ROOT, 'backend', 'data', 'sepolia'), copy, { recursive: true });
const db = new PGlite(copy);
const { rows: [row] } = await db.query(
  `SELECT p.*, e.tx_hash, e.executor_address FROM proposals p JOIN executions e ON e.proposal_id = p.id WHERE lower(e.tx_hash) = $1`, [TX]);
if (!row) throw new Error(`no proposal executed by ${TX}`);
const { rows: audits } = await db.query(`SELECT id, action, actor, details FROM audit_log WHERE entity_id = $1 ORDER BY id`, [row.id]);
await db.close();
fs.rmSync(copy, { recursive: true, force: true });

console.log(`${c.b}Owner-approval verification · public Ethereum Sepolia run (read-only)${c.x}`);
console.log(`${c.d}proposal ${row.id} · source ${row.source} · approval_kind ${row.approval_kind} · data: copy of backend/data/sepolia${c.x}\n`);

// 1. What the owner signed (EIP-712), rebuilt from the stored proposal.
const domain = { name: 'AgentWallet Operator Approval', version: '1', chainId: Number(row.chain_id), verifyingContract: ethers.getAddress(row.contract_address) };
const types = { ApproveTransfer: [
  { name: 'proposalId', type: 'string' }, { name: 'intentId', type: 'bytes32' }, { name: 'token', type: 'address' },
  { name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] };
const message = { proposalId: row.id, intentId: row.intent_id, token: ethers.getAddress(row.token_address), recipient: ethers.getAddress(row.recipient),
  amount: String(row.amount_wei), deadline: String(Math.floor(new Date(row.expires_at).getTime() / 1000)) };
console.log(`${c.b}EIP-712 typed data the owner signed${c.x}  ${c.d}(primaryType ApproveTransfer)${c.x}`);
console.log(`  domain     "${domain.name}" v${domain.version} · chainId ${domain.chainId} · verifyingContract ${domain.verifyingContract}`);
console.log(`  proposalId ${message.proposalId}`);
console.log(`  intentId   ${message.intentId}`);
console.log(`  token      ${message.token}  (native ETH)`);
console.log(`  recipient  ${message.recipient}`);
console.log(`  amount     ${message.amount} wei  (${ethers.formatEther(message.amount)} ETH)`);
console.log(`  deadline   ${message.deadline}  (${new Date(Number(message.deadline) * 1000).toISOString()})`);
console.log(`  signature  ${row.approval_signature.slice(0, 22)}…${row.approval_signature.slice(-8)}\n`);

const recovered = ethers.verifyTypedData(domain, types, message, row.approval_signature);
const provider = new ethers.JsonRpcProvider(RPC, 11155111, { staticNetwork: true });
const abi = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'abi', 'AgentWallet.v1.json'), 'utf8')).abi;
const iface = new ethers.Interface(abi);
const contract = new ethers.Contract(domain.verifyingContract, abi, provider);
const [owner, tx, rc] = await Promise.all([contract.owner(), provider.getTransaction(TX), provider.getTransactionReceipt(TX)]);
const ev = rc.logs.filter((l) => l.address.toLowerCase() === domain.verifyingContract.toLowerCase()).map((l) => iface.parseLog(l)).find((p) => p?.name === 'TransferExecuted');
const approvedAudit = audits.find((a) => a.action === 'PROPOSAL_APPROVED');

let all = true;
console.log(`${c.b}Authorization${c.x}`);
all &= ok(ethers.getAddress(recovered) === ethers.getAddress(owner), `EIP-712 signer recovered = contract owner()`, `${recovered} · owner() ${owner}`);
all &= ok(ethers.getAddress(row.approved_by) === ethers.getAddress(recovered), 'backend recorded approved_by = recovered signer', short(row.approved_by));
all &= ok(approvedAudit?.details?.signature === row.approval_signature, `same signature in hash-chained audit entry #${approvedAudit?.id} PROPOSAL_APPROVED`);
console.log(`\n${c.b}Execution on Ethereum Sepolia${c.x}  ${c.d}${TX}${c.x}`);
all &= ok(rc.status === 1, `receipt status SUCCESS · block ${rc.blockNumber}`);
all &= ok(ethers.getAddress(tx.from) === ethers.getAddress(row.executor_address), `sent by the AGENT key, not the owner`, `${tx.from}`);
all &= ok(iface.parseTransaction({ data: tx.data }).name === 'executeTransfer', 'method executeTransfer(intent, token, recipient, amount)');
all &= ok(ev && ev.args.intentId === message.intentId, 'on-chain intentId = signed intentId', ev?.args.intentId.slice(0, 18) + '…');
all &= ok(ev && ethers.getAddress(ev.args.recipient) === message.recipient, 'on-chain recipient = signed recipient', short(message.recipient));
all &= ok(ev && ev.args.amount.toString() === message.amount, 'on-chain amount = signed amount', `${ethers.formatEther(message.amount)} ETH`);
const block = await provider.getBlock(rc.blockNumber);
all &= ok(block.timestamp <= Number(message.deadline), 'mined before the signed deadline', `${new Date(block.timestamp * 1000).toISOString()}`);
console.log(`\n${c.y}Note:${c.x} the owner signature is verified off-chain by the backend; the contract does not check it. On-chain, the contract`);
console.log('enforces that only the agent key can call executeTransfer, to an allowlisted recipient, within caps, once per intent.');
console.log('Public-run signing used a test-only EIP-1193 bridge holding the owner key (not MetaMask).');
console.log(all ? `\n${c.g}${c.b}OWNER AUTHORIZATION VERIFIED${c.x}` : `\n${c.r}${c.b}VERIFICATION FAILED${c.x}`);
provider.destroy();
process.exit(all ? 0 : 1);
