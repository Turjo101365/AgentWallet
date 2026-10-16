#!/usr/bin/env node
/**
 * Collects public, verifiable execution evidence for an AgentWallet deployment (Deliverable 06).
 *
 *   node scripts/collect-evidence.mjs                       # Base Sepolia defaults
 *   node scripts/collect-evidence.mjs --deployment contracts/deployments/base_sepolia.json \
 *        --rpc https://sepolia.base.org --db backend/data/base-sepolia --out evidence/base-sepolia
 *
 * Read-only: it uses eth_chainId / eth_getLogs / eth_getTransactionReceipt / eth_getBlockByNumber and
 * reads a COPY of the backend database. It holds no key and sends nothing.
 *
 * Output: <out>/evidence.json and <out>/EVIDENCE.md. These are every AgentWallet event with its tx hash,
 * receipt, sender role and explorer link. Each agent transfer is classified as AUTONOMOUS (executed
 * under an owner-signed task grant, with no per-transfer owner signature) or OWNER_APPROVED (EIP-712
 * owner signature), and is checked against the on-chain allowlist and caps reconstructed from events.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendRequire = createRequire(path.join(ROOT, 'backend', 'package.json'));
const { ethers } = backendRequire('ethers');
const fromBackend = (p) => import(pathToFileURL(path.join(ROOT, 'backend', 'src', p)).href);

const EXPLORERS = { 84532: 'https://sepolia.basescan.org', 11155111: 'https://sepolia.etherscan.io' };
const DEFAULT_RPC = { 84532: 'https://sepolia.base.org', 11155111: 'https://ethereum-sepolia-rpc.publicnode.com', 31337: 'http://127.0.0.1:8545' };
// Per-network defaults: eth_getLogs range the public RPC accepts, backend database, output folder.
const DEFAULTS = { 84532: { range: 200, db: 'backend/data/base-sepolia', out: 'evidence/base-sepolia' }, 11155111: { range: 2000, db: 'backend/data/sepolia', out: 'evidence/sepolia' } };

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) throw new Error(`Unexpected argument ${argv[i]}`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

/** Copies the PGlite directory so the evidence run never touches the live database. */
async function readOffchain(dbDir) {
  if (!dbDir || !fs.existsSync(dbDir)) return null;
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-evidence-db-'));
  fs.cpSync(dbDir, copy, { recursive: true });
  fs.rmSync(path.join(copy, 'postmaster.pid'), { force: true });
  const { openDatabase } = await fromBackend('db/index.js');
  const { createRepositories } = await fromBackend('repositories/index.js');
  const db = await openDatabase({ pgliteDir: copy });
  try {
    const rows = (await db.query(`
      SELECT e.tx_hash, e.status AS execution_status, e.executor_address,
             p.id AS proposal_id, p.source, p.approval_kind, p.approved_by, p.approved_at,
             p.status AS proposal_status,
             -- Grant-approved proposals store the task's grant signature, not a new one for this transfer.
             (t.grant_signature IS NOT NULL AND p.approval_signature = t.grant_signature) AS signature_is_task_grant,
             r.id AS run_id, r.run_key, r.status AS run_status, r.decision,
             t.id AS task_id, t.title AS task_title, t.kind AS task_kind, t.max_runs, t.max_total_wei,
             t.valid_until, t.authorized_by, t.authorized_at, (t.grant_signature IS NOT NULL) AS has_grant_signature
        FROM executions e
        JOIN proposals p ON p.id = e.proposal_id
   LEFT JOIN task_runs r ON r.id = p.task_run_id
   LEFT JOIN tasks t ON t.id = r.task_id
       WHERE e.tx_hash IS NOT NULL`)).rows;
    const audit = await createRepositories(db).audit.verify();
    // AI-agent execution log: the turn whose trusted action list created a proposal or task.
    const turns = (await db.query(`SELECT id, conversation_id, user_message, status, provider, model, plan, final_text, actions, model_calls, usage, created_at, completed_at FROM agent_turns ORDER BY created_at`)).rows;
    const tools = (await db.query(`SELECT turn_id, tool_name, input, status, error, created_at FROM tool_invocations ORDER BY created_at`)).rows;
    const agentLogFor = (id) => {
      if (!id) return null;
      const t = turns.find((x) => (x.actions || []).some((a) => a.id === id));
      if (!t) return null;
      return {
        conversationId: t.conversation_id, turnId: t.id, provider: t.provider, model: t.model, status: t.status,
        userMessage: t.user_message, plan: t.plan, finalText: t.final_text, modelCalls: t.model_calls, usage: t.usage,
        startedAt: new Date(t.created_at).toISOString(), completedAt: t.completed_at ? new Date(t.completed_at).toISOString() : null,
        tools: tools.filter((x) => x.turn_id === t.id).map((x) => ({ tool: x.tool_name, status: x.status, input: x.input, error: x.error, at: new Date(x.created_at).toISOString() })),
      };
    };
    for (const r of rows) r.agent_log = agentLogFor(r.task_id) || agentLogFor(r.proposal_id);
    return { byTx: new Map(rows.map((r) => [r.tx_hash.toLowerCase(), r])), audit };
  } finally {
    await db.close();
    fs.rmSync(copy, { recursive: true, force: true });
  }
}

export async function collectEvidence({ deployment: deploymentFile, rpc, db: dbDir, out, range } = {}) {
  deploymentFile = path.resolve(ROOT, deploymentFile || 'contracts/deployments/base_sepolia.json'); // pass contracts/deployments/sepolia.json for Ethereum Sepolia
  if (!fs.existsSync(deploymentFile)) throw new Error(`No deployment record at ${deploymentFile}. Deploy first.`);
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
  const chainId = Number(deployment.chainId);
  const rpcUrl = rpc || DEFAULT_RPC[chainId];
  if (!rpcUrl) throw new Error(`No RPC URL for chain ${chainId}; pass --rpc`);
  const explorer = EXPLORERS[chainId] || null;
  const link = (kind, v) => (explorer && v ? `${explorer}/${kind}/${v}` : null);
  const chunk = Number(range || DEFAULTS[chainId]?.range || 2000);
  if (dbDir === undefined) dbDir = DEFAULTS[chainId]?.db || null;

  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
  try {
    const rpcChain = Number(await provider.send('eth_chainId', []));
    if (rpcChain !== chainId) throw new Error(`RPC is on chain ${rpcChain}, deployment is for ${chainId}`);
    const { agentWalletInterface } = await fromBackend('services/chainService.js');
    const contract = ethers.getAddress(deployment.contractAddress);
    const code = await provider.getCode(contract);
    if (code === '0x') throw new Error(`No contract code at ${contract} on chain ${chainId}`);

    // 1. Every AgentWallet event since deployment, in RPC-safe ranges.
    const latest = await provider.getBlockNumber();
    const logs = [];
    for (let from = Number(deployment.deployBlock || 0); from <= latest; from += chunk) {
      logs.push(...(await provider.getLogs({ address: contract, fromBlock: from, toBlock: Math.min(latest, from + chunk - 1) })));
    }
    const byTx = new Map();
    for (const log of logs) {
      const parsed = (() => { try { return agentWalletInterface.parseLog(log); } catch { return null; } })();
      if (!parsed) continue;
      const args = Object.fromEntries(parsed.fragment.inputs.map((inp, i) => [inp.name, typeof parsed.args[i] === 'bigint' ? parsed.args[i].toString() : parsed.args[i]]));
      if (!byTx.has(log.transactionHash)) byTx.set(log.transactionHash, { blockNumber: log.blockNumber, logIndex: log.index, events: [] });
      byTx.get(log.transactionHash).events.push({ name: parsed.name, logIndex: log.index, args });
    }
    if (deployment.deployTxHash && !byTx.has(deployment.deployTxHash)) byTx.set(deployment.deployTxHash, { blockNumber: deployment.deployBlock, logIndex: -1, events: [] });

    // 2. Receipts, blocks, roles.
    const roles = { [ethers.getAddress(deployment.owner)]: 'owner', [ethers.getAddress(deployment.agent)]: 'agent' };
    const blockTime = new Map();
    const txs = [];
    for (const [hash, info] of [...byTx.entries()].sort((a, b) => a[1].blockNumber - b[1].blockNumber || a[1].logIndex - b[1].logIndex)) {
      const receipt = await provider.getTransactionReceipt(hash);
      if (!blockTime.has(receipt.blockNumber)) blockTime.set(receipt.blockNumber, Number((await provider.getBlock(receipt.blockNumber)).timestamp));
      const from = ethers.getAddress(receipt.from);
      txs.push({
        hash,
        explorerUrl: link('tx', hash),
        blockNumber: receipt.blockNumber,
        timestamp: new Date(blockTime.get(receipt.blockNumber) * 1000).toISOString(),
        from,
        fromRole: roles[from] || (hash === deployment.deployTxHash ? 'deployer' : 'other'),
        status: receipt.status === 1 ? 'SUCCESS' : 'REVERTED',
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPriceWei: (receipt.gasPrice ?? receipt.effectiveGasPrice ?? 0n).toString(),
        feeWei: (receipt.fee ?? 0n).toString(),
        kind: hash === deployment.deployTxHash ? 'Deployment' : info.events.map((e) => e.name).join(' + '),
        events: info.events,
      });
    }

    // 3. Replay the on-chain policy (allowlist and caps) and check every agent transfer against it.
    const offchain = await readOffchain(dbDir ? path.resolve(ROOT, dbDir) : null);
    const allowed = new Map();
    const policies = new Map();
    const spent = new Map();
    let agent = ethers.getAddress(deployment.agent);
    const transfers = [];
    for (const tx of txs) {
      for (const ev of tx.events) {
        if (ev.name === 'RecipientUpdated') allowed.set(ethers.getAddress(ev.args.recipient), ev.args.allowed);
        if (ev.name === 'TokenPolicyUpdated') policies.set(ethers.getAddress(ev.args.token), { enabled: ev.args.enabled, perTx: BigInt(ev.args.perTxLimit), daily: BigInt(ev.args.dailyLimit) });
        if (ev.name === 'AgentUpdated') agent = ethers.getAddress(ev.args.newAgent);
        if (ev.name !== 'TransferExecuted') continue;
        const token = ethers.getAddress(ev.args.token);
        const recipient = ethers.getAddress(ev.args.recipient);
        const amount = BigInt(ev.args.amount);
        const policy = policies.get(token);
        const dayKey = `${token}:${ev.args.day}`;
        spent.set(dayKey, (spent.get(dayKey) || 0n) + amount);
        const off = offchain?.byTx.get(tx.hash.toLowerCase()) || null;
        const authorization = !off ? 'UNKNOWN (no backend database supplied)'
          : off.approval_kind === 'TASK_GRANT' ? 'AUTONOMOUS'
          : off.approval_kind === 'OWNER_SIGNATURE' ? 'OWNER_APPROVED' : `UNKNOWN (${off.approval_kind})`;
        transfers.push({
          txHash: tx.hash,
          explorerUrl: tx.explorerUrl,
          timestamp: tx.timestamp,
          intentId: ev.args.intentId,
          token,
          recipient,
          amountWei: amount.toString(),
          authorization,
          checks: {
            sentByOnChainAgent: tx.from === agent,
            recipientAllowlisted: allowed.get(recipient) === true,
            withinPerTxCap: policy ? amount <= policy.perTx : null,
            withinDailyCap: policy ? spent.get(dayKey) <= policy.daily && BigInt(ev.args.spentToday) === spent.get(dayKey) : null,
          },
          offchain: off && {
            proposalId: off.proposal_id,
            source: off.source,
            approvalKind: off.approval_kind,
            approvedBy: off.approved_by,
            ownerSignatureOnThisTransfer: off.approval_kind === 'OWNER_SIGNATURE',
            authorizedByTaskGrantSignature: off.signature_is_task_grant === true,
            agentLog: off.agent_log || null,
            task: off.task_id ? { id: off.task_id, title: off.task_title, kind: off.task_kind, runKey: off.run_key, runStatus: off.run_status, maxRuns: off.max_runs, maxTotalWei: off.max_total_wei, validUntil: off.valid_until, grantSignedBy: off.authorized_by, grantSignedAt: off.authorized_at, hasGrantSignature: off.has_grant_signature, decisionOutcome: off.decision?.outcome || null } : null,
          },
        });
      }
    }

    const evidence = {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      network: { chainId, rpcUrl, explorer },
      contract: { address: contract, explorerUrl: link('address', contract), deployTxHash: deployment.deployTxHash || null, deployBlock: deployment.deployBlock, owner: deployment.owner, agent: deployment.agent },
      summary: {
        transactions: txs.length,
        reverted: txs.filter((t) => t.status !== 'SUCCESS').length,
        agentTransfers: transfers.length,
        autonomous: transfers.filter((t) => t.authorization === 'AUTONOMOUS').length,
        ownerApproved: transfers.filter((t) => t.authorization === 'OWNER_APPROVED').length,
        allTransfersPassedOnChainChecks: transfers.every((t) => Object.values(t.checks).every((v) => v === true)),
        aiAgentDraftedTransfers: transfers.filter((t) => t.offchain?.agentLog).length,
        auditLog: offchain ? offchain.audit : null,
      },
      transactions: txs,
      transfers,
    };

    if (out !== false) {
      const dir = path.resolve(ROOT, out || DEFAULTS[chainId]?.out || `evidence/chain-${chainId}`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
      fs.writeFileSync(path.join(dir, 'EVIDENCE.md'), renderMarkdown(evidence));
      evidence.outDir = dir;
    }
    return evidence;
  } finally {
    provider.destroy();
  }
}

function renderMarkdown(ev) {
  const short = (h) => `${h.slice(0, 10)}…${h.slice(-6)}`;
  const tx = (h, url) => (url ? `[\`${short(h)}\`](${url})` : `\`${h}\``);
  const eth = (wei) => `${ethers.formatEther(wei)} ETH`;
  const s = ev.summary;
  const lines = [
    `# On-chain execution evidence (chain ${ev.network.chainId})`,
    '',
    `Generated ${ev.generatedAt} by \`scripts/collect-evidence.mjs\` (read-only). Re-run the script to reproduce it from the chain.`,
    '',
    '| | |',
    '|---|---|',
    `| Contract | ${ev.contract.explorerUrl ? `[\`${ev.contract.address}\`](${ev.contract.explorerUrl})` : `\`${ev.contract.address}\``} |`,
    `| Deploy tx | ${ev.contract.deployTxHash ? tx(ev.contract.deployTxHash, ev.network.explorer && `${ev.network.explorer}/tx/${ev.contract.deployTxHash}`) : 'n/a'} (block ${ev.contract.deployBlock}) |`,
    `| Owner / agent | \`${ev.contract.owner}\` / \`${ev.contract.agent}\` |`,
    `| Transactions | ${s.transactions} (${s.reverted} reverted) |`,
    `| Agent transfers | ${s.agentTransfers}: **${s.autonomous} autonomous** (task grant), ${s.ownerApproved} owner-approved (EIP-712) |`,
    `| On-chain checks | ${s.allTransfersPassedOnChainChecks ? 'every transfer was sent by the on-chain agent to an allowlisted recipient within the per-tx and daily caps' : '**at least one transfer failed a check, see below**'} |`,
    `| AI agent | ${s.aiAgentDraftedTransfers} of ${s.agentTransfers} transfers were drafted by the AI agent (log below) |`,
    `| Audit log hash chain | ${s.auditLog ? (s.auditLog.valid ? `valid (${s.auditLog.entries} entries)` : `**BROKEN at ${s.auditLog.brokenAt}**`) : 'not checked (no database)'} |`,
    '',
    '## Agent transfers',
    '',
    '| Time (UTC) | Tx | Amount | Recipient | Authorization | Agent sent | Allowlisted | ≤ per-tx | ≤ daily |',
    '|---|---|---|---|---|---|---|---|---|',
    ...ev.transfers.map((t) => `| ${t.timestamp} | ${tx(t.txHash, t.explorerUrl)} | ${eth(t.amountWei)} | \`${t.recipient}\` | ${t.authorization}${t.offchain?.task ? ` (task "${t.offchain.task.title || t.offchain.task.id}", run ${t.offchain.task.runKey})` : ''} | ${t.checks.sentByOnChainAgent ? '✓' : '✗'} | ${t.checks.recipientAllowlisted ? '✓' : '✗'} | ${t.checks.withinPerTxCap ? '✓' : '✗'} | ${t.checks.withinDailyCap ? '✓' : '✗'} |`),
    '',
    '## AI agent execution log',
    '',
    ...(ev.transfers.some((t) => t.offchain?.agentLog) ? ev.transfers.filter((t) => t.offchain?.agentLog).flatMap((t) => {
      const a = t.offchain.agentLog;
      return [
        `### ${t.authorization === 'AUTONOMOUS' ? 'Autonomous' : 'Owner-approved'} transfer ${tx(t.txHash, t.explorerUrl)}`,
        '',
        `- **Instruction:** ${a.userMessage.replace(/^\[context:[^\]]*\]\s*/, '')}`,
        `- **Model:** ${a.provider} ${a.model || ''} · ${a.modelCalls} model calls · turn ${a.status} · ${a.startedAt}`,
        `- **Plan:** ${a.plan ? `${a.plan.goal}: ${a.plan.steps.map((s) => s.tool).join(' → ')}` : '—'}`,
        `- **Tool calls:** ${a.tools.map((x) => `\`${x.tool}\` ${x.status}`).join(', ')}`,
        `- **Agent reply:** ${(a.finalText || '').replace(/\s+/g, ' ').slice(0, 400)}`,
        `- **Then:** ${t.authorization === 'AUTONOMOUS' ? 'the owner signed the task grant (EIP-712); the scheduler executed the run with no per-transfer signature' : 'the owner signed this exact transfer (EIP-712); the agent key executed it'}`,
        '',
      ];
    }) : ['No transfer in this report was drafted by the AI agent.', '']),
    '## All contract transactions',
    '',
    '| Block | Time (UTC) | Tx | From | Events | Status | Gas used |',
    '|---|---|---|---|---|---|---|',
    ...ev.transactions.map((t) => `| ${t.blockNumber} | ${t.timestamp} | ${tx(t.hash, t.explorerUrl)} | ${t.fromRole} | ${t.kind || '—'} | ${t.status} | ${t.gasUsed} |`),
    '',
  ];
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  collectEvidence(parseArgs(process.argv.slice(2)))
    .then((ev) => {
      console.log(`Evidence written to ${ev.outDir}`);
      console.log(JSON.stringify({ ...ev.summary, auditLog: ev.summary.auditLog && { valid: ev.summary.auditLog.valid, entries: ev.summary.auditLog.entries } }));
    })
    .catch((err) => {
      console.error(`[collect-evidence] ${err.message}`);
      process.exit(1);
    });
}
