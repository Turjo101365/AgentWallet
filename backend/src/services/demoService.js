import crypto from 'node:crypto';
import { ethers } from 'ethers';
import { z } from 'zod';
import { AppError, badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors.js';
import { Mutex } from '../lib/mutex.js';
import { sameAddress } from '../lib/address.js';
import { approvalTypedData } from '../lib/approval.js';
import { grantTypedData } from '../lib/schedule.js';

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const DEMO_TOKEN = /^Bearer d\.([0-9a-f]{64})$/;

/** What the judge demo assistant may call: read tools plus propose_transfer. No grants, no policy or task writes. */
export const DEMO_TOOLS = new Set(['record_plan', 'list_recipients', 'get_portfolio', 'get_spending', 'get_policy_settings', 'explain_proposal', 'propose_transfer', 'request_clarification','get_treasury_overview','generate_treasury_plan','prepare_treasury_payment']);

/** Accurate wording shown wherever a demo authorization appears. Never implies the judge's own wallet signed. */
export const DEMO_AUTHORIZATION = {
  kind: 'DEMO_SERVER_KEY_AFTER_JUDGE_CONFIRMATION',
  label: 'Demo authorization: after you confirmed this exact payment in the browser, the sandbox demo owner key held by the server signed the EIP-712 approval. Your own wallet did not sign it.',
};

export const startSchema = z.object({ inviteCode: z.string().trim().min(6).max(128).optional() }).strict();
export const chatSchema = z.object({ message: z.string().trim().min(1).max(1200), conversationId: z.string().uuid().nullable().optional() }).strict();
export const confirmSchema = z.object({ confirm: z.literal(true), recipient: z.string(), amountWei: z.string().regex(/^\d{1,40}$/) }).strict();

/**
 * Judge demo wallet: invite-gated live execution on the demo sandbox, with every limit enforced server-side
 * (per-session, global daily, per-transfer, treasury floor, gas) and on-chain (contract caps, allowlist, v2 signature
 * checks). One demo execution runs at a time.
 *
 * `sandbox` is { container, ownerSigner } from createDemoSandbox. `budgetDb` holds the shared public AI daily quota.
 */
export function createDemoService({ demo, sandbox, budgetDb, aiDailyLimit, logger,publicAiGate={active:false} }) {
  const { container, ownerSigner } = sandbox;
  const { db, repos, proposals, agentChat, chain, config } = container;
  const executionMutex = new Mutex();
  let executing = false;
  let chatting = false;
  const owner = demo.ownerAddress;
  const ownerMutex = new Mutex();

  async function init() {
    // Invite codes configured as SHA-256 digests are registered once; admins can add or revoke more later.
    for (const hash of demo.inviteHashes) {
      await db.query(`INSERT INTO demo_invites (id, code_hash, label, max_sessions, created_by) VALUES ($1, $2, 'configured', 1, 'environment')
        ON CONFLICT (code_hash) DO NOTHING`, [crypto.randomUUID(), hash]);
    }
  }

  // ------------------------------------------------------------------ sessions
  async function startSession({ inviteCode } = {}) {
    return db.tx(async q => {
    let invite = null;
    if (inviteCode) {
      const { rows } = await q.query(`UPDATE demo_invites SET sessions_used = sessions_used + 1
        WHERE code_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()) AND sessions_used < max_sessions
        RETURNING id, label`, [sha256(inviteCode.trim())]);
      if (!rows.length) throw new AppError(403, 'INVITE_INVALID', 'Invite code is invalid, revoked, expired or used up');
      invite = rows[0];
    }
    const token = crypto.randomBytes(32).toString('hex');
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + demo.sessionTtlSeconds * 1000);
    await q.query(`INSERT INTO demo_sessions (id, token_hash, invite_id, execution_allowed, expires_at) VALUES ($1, $2, $3, $4, $5)`,
      [id, sha256(token), invite?.id || null, Boolean(invite), expiresAt]);
    await repos.audit.append({ actor: `demo:${id}`, action: 'DEMO_SESSION_STARTED', entityType: 'demo_session', entityId: id, details: { executionAllowed: Boolean(invite), invite: invite?.label || null } }, q);
    return { token: `d.${token}`, sessionId: id, executionAllowed: Boolean(invite), expiresAt: Math.floor(expiresAt.getTime() / 1000), limits: publicLimits() };
    });
  }

  async function authenticate(header) {
    const m = DEMO_TOKEN.exec(header || '');
    if (!m) throw unauthorized('A demo session is required');
    const { rows } = await db.query(`SELECT s.id, (s.execution_allowed AND i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at>now())) AS execution_allowed, s.tx_count, s.ai_count, s.expires_at FROM demo_sessions s
      LEFT JOIN demo_invites i ON i.id=s.invite_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`, [sha256(m[1])]);
    if (!rows.length) throw unauthorized('Demo session is invalid or expired');
    const r = rows[0];
    return { id: r.id, executionAllowed: r.execution_allowed, txCount: r.tx_count, aiCount: r.ai_count, expiresAt: Math.floor(new Date(r.expires_at).getTime() / 1000) };
  }

  function publicLimits() {
    return {
      maxTxPerSession: demo.maxTxPerSession,
      maxAiPerSession: demo.maxAiPerSession,
      maxAmountEth: ethers.formatEther(demo.maxAmountWei),
      dailyTxLimit: demo.dailyTxLimit,
      dailyAmountEth: ethers.formatEther(demo.dailyAmountWei),
      minTreasuryEth: demo.minTreasuryEth,
      minAgentGasEth: demo.minAgentGasEth,
      maxGasPerTxEth:ethers.formatEther(demo.maxGasPerTxWei),
      sessionGasEth:ethers.formatEther(demo.sessionGasWei),
      dailyGasEth:ethers.formatEther(demo.dailyGasWei),
    };
  }

  async function executionEnabled() {
    const { rows } = await db.query('SELECT execution_enabled FROM demo_settings WHERE id = 1');
    return rows[0]?.execution_enabled !== false;
  }
  async function effectiveLimits() {
    const r=(await db.query('SELECT limits FROM demo_settings WHERE id=1')).rows[0];
    return { ...publicLimits(),...(r?.limits || {}) };
  }
  async function setLimits(patch, by) {
    const ceiling=publicLimits();
    for (const [key,value] of Object.entries(patch)) {
      if (!(key in ceiling)) throw badRequest('INVALID_LIMIT','Unknown limit');
      if (key==='minTreasuryEth' || key==='minAgentGasEth') {
        if (ethers.parseEther(value)<ethers.parseEther(ceiling[key])) throw forbidden('Reserve floors cannot be lowered');
      } else if (key.endsWith('Eth')) {
        if (ethers.parseEther(value)>ethers.parseEther(ceiling[key])) throw forbidden('Cannot exceed approved funding ceilings');
      } else if (!Number.isInteger(value) || value<0 || value>ceiling[key]) throw forbidden('Cannot exceed approved count ceilings');
    }
    await db.query('UPDATE demo_settings SET limits=$1,updated_by=$2,updated_at=now() WHERE id=1',[{...(await effectiveLimits()),...patch},by]);
    return effectiveLimits();
  }

  async function status(session = null) {
    const [today, enabled, snapshot, limits] = await Promise.all([
      db.query(`SELECT tx_count, amount_wei FROM demo_daily_usage WHERE day = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date`),
      executionEnabled(),
      chain.getSnapshot().catch(() => null),
      effectiveLimits(),
    ]);
    const native = snapshot?.tokens?.find((t) => t.address === ethers.ZeroAddress);
    return {
      enabled: true,
      sandbox: { chainId: config.chainId, network: config.network.name, contract: config.contractAddress, contractUrl: chain.addressUrl(config.contractAddress), owner, agent: demo.agentAddress, keysHeldBy: 'backend (demo sandbox only)' },
      authorization: DEMO_AUTHORIZATION,
      limits,
      live: snapshot ? {
        paused: snapshot.paused,
        treasuryEth: native ? ethers.formatEther(native.balance) : null,
        agentGasEth: snapshot.executorBalance === null ? null : ethers.formatEther(snapshot.executorBalance),
      } : null,
      executionEnabled: enabled,
      busy: executing,
      today: { txCount: today.rows[0]?.tx_count || 0, amountEth: ethers.formatEther(BigInt(today.rows[0]?.amount_wei || 0)) },
      session: session ? { executionAllowed: session.executionAllowed, txRemaining: Math.max(0, limits.maxTxPerSession - session.txCount), aiRemaining: Math.max(0, demo.maxAiPerSession - session.aiCount), expiresAt: session.expiresAt } : null,
    };
  }

  // ------------------------------------------------------------------ AI planning
  async function chat(session, { message, conversationId = null }) {
    if (chatting || publicAiGate.active) throw new AppError(429, 'AI_BUSY', 'An AI request is already running');
    chatting = true;
    publicAiGate.active=true;
    try {
    const used = await db.query('UPDATE demo_sessions SET ai_count = ai_count + 1 WHERE id = $1 AND ai_count < $2 RETURNING ai_count', [session.id, demo.maxAiPerSession]);
    if (!used.rows.length) throw new AppError(429, 'DEMO_AI_LIMIT', 'This demo session has used its AI requests');
    const budget = await budgetDb.query(`INSERT INTO judge_ai_usage(day, requests) VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 1)
      ON CONFLICT (day) DO UPDATE SET requests = judge_ai_usage.requests + 1 WHERE judge_ai_usage.requests < $1 RETURNING requests`, [aiDailyLimit]);
    if (!budget.rows.length) throw new AppError(429, 'AI_DAILY_LIMIT', 'The public AI daily limit has been reached');
    const turn = await agentChat.chat({ message, conversationId }, { address: owner }, {
      tools: DEMO_TOOLS,
      owner: `demo:${session.id}`,
      treasuryPrincipal:{address:owner,demoSessionId:session.id,executionAllowed:session.executionAllowed},
      maxModelCalls: 4,
      maxOutputTokens: 1024,
      maxContextBytes: 24000,
      systemNote: [
        'PUBLIC JUDGE DEMO: you are talking to a hackathon judge, not the owner. This is a separate Ethereum Sepolia demo sandbox with testnet ETH only.',
        `A transfer you propose only executes if the judge explicitly confirms it in the browser; the server's demo owner key then signs. Demo transfers above ${ethers.formatEther(demo.maxAmountWei)} ETH are refused.`,
        'You cannot schedule payments, change policy or pause anything here. Never ask for private keys or seed phrases.',
      ].join('\n'),
    });
    const proposalIds = turn.actions.filter((a) => a.type === 'proposal' && a.id).map((a) => a.id);
    for (const id of proposalIds) await db.query('INSERT INTO demo_actions (proposal_id, session_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, session.id]);
    const drafted = await Promise.all(proposalIds.map((id) => getProposal(session, id)));
    return { ...turn, proposals: drafted, model: container.llm.model };
    } finally { chatting = false;publicAiGate.active=false; }
  }

  const conversations = (session) => agentChat.conversations({ address: owner }, `demo:${session.id}`);
  const conversation = (session, id) => agentChat.conversation(id, { address: owner }, `demo:${session.id}`);

  // ------------------------------------------------------------------ proposals
  async function ownerOf(proposalId) {
    const { rows } = await db.query(`SELECT session_id, confirmed_at FROM demo_actions WHERE proposal_id = $1
      UNION ALL SELECT g.session_id,g.confirmed_at FROM proposals p JOIN task_runs r ON r.id=p.task_run_id JOIN demo_grants g ON g.task_id=r.task_id WHERE p.id=$1 LIMIT 1`, [proposalId]);
    return rows[0] || null;
  }

  function withDemoLabels(p, mine) {
    const demoView = { mine, authorization: p.approvalKind === 'OWNER_SIGNATURE' ? DEMO_AUTHORIZATION : null };
    // The typed data is the server's to sign; the browser only sees what is being confirmed.
    return { ...p, approvalTypedData: null, demo: demoView, txReceiptUrl: p.execution?.explorerUrl || null };
  }

  async function getProposal(session, id) {
    const p = await proposals.get(id);
    const link = await ownerOf(id);
    if (!link || link.session_id !== session.id) throw forbidden('Proposal belongs to another session');
    return withDemoLabels(p, Boolean(link && link.session_id === session.id));
  }

  async function listProposals(session, { status = null, limit = 100 } = {}) {
    const rows = await proposals.list({ status, limit });
    const { rows: mine } = await db.query(`SELECT proposal_id FROM demo_actions WHERE session_id = $1 UNION ALL
      SELECT p.id AS proposal_id FROM proposals p JOIN task_runs r ON r.id=p.task_run_id JOIN demo_grants g ON g.task_id=r.task_id WHERE g.session_id=$1`, [session.id]);
    const own = new Set(mine.map((r) => r.proposal_id));
    return rows.filter((p) => own.has(p.id)).map((p) => withDemoLabels(p, true));
  }

  async function confirm(session, id, { recipient, amountWei }) {
    if (!session.executionAllowed) throw new AppError(403, 'INVITE_REQUIRED', 'Live demo transactions need an invite code. You can still explore and draft payments.');
    if (!(await executionEnabled())) throw new AppError(503, 'DEMO_EXECUTION_DISABLED', 'Live demo execution is switched off by the administrator');
    const link = await ownerOf(id);
    if (!link || link.session_id !== session.id) throw forbidden('Only the demo session that drafted this proposal can confirm it');
    if (link.confirmed_at) throw conflict('ALREADY_CONFIRMED', 'This proposal was already confirmed');
    // Claimed synchronously, so two simultaneous confirmations can never both pass this check.
    if (executing) throw conflict('DEMO_BUSY', 'Another demo payment is executing. Try again in a moment.');
    executing = true;

    return executionMutex.run(async () => {
      let charged = null;
      try {
        const caps=await effectiveLimits();
        const p = await proposals.get(id);
        if (p.status !== 'AWAITING_APPROVAL') throw conflict('INVALID_STATE', `Proposal is ${p.status}`);
        if (!sameAddress(p.recipient, recipient) || p.amountWei !== amountWei) throw badRequest('CONFIRMATION_MISMATCH', 'The confirmed recipient or amount differs from the proposal');
        if (p.token.address !== ethers.ZeroAddress) throw badRequest('DEMO_TOKEN_UNSUPPORTED', 'The demo sandbox only sends testnet ETH');
        const amount = BigInt(p.amountWei);
        if (amount > ethers.parseEther(caps.maxAmountEth)) throw new AppError(422, 'DEMO_AMOUNT_LIMIT', `Demo payments are limited to ${caps.maxAmountEth} ETH`);

        // Charge the per-session and global daily budgets atomically before signing; refunded if nothing is sent.
        const s = await db.query('UPDATE demo_sessions SET tx_count = tx_count + 1 WHERE id = $1 AND tx_count < $2 AND revoked_at IS NULL AND expires_at>now() RETURNING tx_count', [session.id, caps.maxTxPerSession]);
        if (!s.rows.length) throw new AppError(429, 'DEMO_SESSION_TX_LIMIT', `This demo session may send at most ${caps.maxTxPerSession} payments`);
        charged = { session: true, global: false, amount };
        const g = await db.query(`INSERT INTO demo_daily_usage (day, tx_count, amount_wei)
          SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 1, $1 WHERE $2>=1 AND $1::numeric<=$3
          ON CONFLICT (day) DO UPDATE SET tx_count = demo_daily_usage.tx_count + 1, amount_wei = demo_daily_usage.amount_wei + $1
          WHERE demo_daily_usage.tx_count < $2 AND demo_daily_usage.amount_wei + $1 <= $3 RETURNING tx_count, day::text AS day`,
        [amount.toString(), caps.dailyTxLimit, ethers.parseEther(caps.dailyAmountEth).toString()]);
        if (!g.rows.length || amount > demo.dailyAmountWei) throw new AppError(429, 'DEMO_DAILY_LIMIT', 'The shared daily demo limit has been reached');
        charged.global = true;
        charged.day = g.rows[0].day;

        // The server-held demo owner key signs exactly this proposal, then the normal approval path re-checks
        // policy, simulation, signer and deadline before the agent key may execute it.
        const { domain, types, message } = approvalTypedData(p);
        const signature = await ownerSigner.signTypedData(domain, types, message);
        const claimed = await db.query('UPDATE demo_actions SET confirmed_at = now(), confirmation = $2 WHERE proposal_id = $1 AND confirmed_at IS NULL RETURNING proposal_id', [id, 'judge confirmed in browser']);
        if (!claimed.rows.length) throw conflict('ALREADY_CONFIRMED', 'This proposal was already confirmed');
        await repos.audit.append({ actor: `demo:${session.id}`, action: 'DEMO_AUTHORIZATION_CONFIRMED', entityType: 'proposal', entityId: id,
          details: { authorization: DEMO_AUTHORIZATION.kind, recipient: p.recipient, amountWei: p.amountWei, signer: owner } });
        // Keep the charge until approval succeeds: a refusal here (policy/reserve, expiry) hands nothing to the
        // executor. Once approval is handed to the executor, never refund a timeout/unknown outcome.
        await proposals.approve(id, { signature }, { address: owner });
        charged = null;

        const deadline = Date.now() + demo.executionWaitMs;
        let latest = await proposals.get(id);
        while (!['CONFIRMED', 'FAILED'].includes(latest.status) && Date.now() < deadline) {
          await sleep(1500);
          latest = await proposals.get(id);
        }
        charged = null;
        let receipt = null;
        if (latest.status === 'CONFIRMED' && latest.execution?.txHash) {
          const rc = await chain.provider.getTransactionReceipt(latest.execution.txHash);
          if (rc) receipt = { status: rc.status, blockNumber: rc.blockNumber, gasUsed: rc.gasUsed.toString(), from: rc.from, to: rc.to, txHash: rc.hash, explorerUrl: chain.txUrl(rc.hash) };
        }
        logger.info('Demo payment processed', { proposalId: id, status: latest.status, txHash: latest.execution?.txHash || null });
        return { ...withDemoLabels(latest, true), receipt, pending: !['CONFIRMED', 'FAILED'].includes(latest.status) };
      } catch (err) {
        if (charged) {
          // Refund only if the proposal never became an authorization the executor could act on.
          const state = (await proposals.get(id).catch(() => null))?.status;
          if (state && !['APPROVED', 'SUBMITTED', 'CONFIRMED'].includes(state)) await refund(session.id, charged).catch(() => {});
        }
        throw err;
      } finally {
        executing = false;
      }
    });
  }

  async function refund(sessionId, charged) {
    const { amount } = charged;
    if (charged.session) await db.query('UPDATE demo_sessions SET tx_count = GREATEST(tx_count - 1, 0) WHERE id = $1', [sessionId]);
    if (charged.global) {
      await db.query(`UPDATE demo_daily_usage SET tx_count = GREATEST(tx_count - 1, 0), amount_wei = GREATEST(amount_wei - $1, 0)
        WHERE day = $2::date`, [amount.toString(), charged.day]);
    }
  }

  // ------------------------------------------------------------------ admin
  async function setExecutionEnabled(enabled, by) {
    await db.query('UPDATE demo_settings SET execution_enabled = $1, updated_by = $2, updated_at = now() WHERE id = 1', [enabled, by]);
    await repos.audit.append({ actor: by, action: enabled ? 'DEMO_EXECUTION_ENABLED' : 'DEMO_EXECUTION_DISABLED', entityType: 'demo', entityId: config.contractAddress, details: {} });
    return { executionEnabled: enabled };
  }

  async function createInvite({ label, maxSessions, expiresInHours }, by) {
    const code = `aw-${crypto.randomBytes(9).toString('base64url')}`;
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO demo_invites (id, code_hash, label, max_sessions, created_by, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, sha256(code), label, maxSessions, by, expiresInHours ? new Date(Date.now() + expiresInHours * 3600 * 1000) : null]);
    await repos.audit.append({ actor: by, action: 'DEMO_INVITE_CREATED', entityType: 'demo_invite', entityId: id, details: { label, maxSessions } });
    return { id, code, label, maxSessions }; // the plaintext code is returned once and never stored
  }

  async function revokeInvite(id, by) {
    const { rowCount } = await db.query('UPDATE demo_invites SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [id]);
    if (!rowCount) throw notFound('Invite not found or already revoked');
    await db.query('UPDATE demo_sessions SET execution_allowed=FALSE WHERE invite_id=$1', [id]);
    await repos.audit.append({ actor: by, action: 'DEMO_INVITE_REVOKED', entityType: 'demo_invite', entityId: id, details: {} });
    return { revoked: true };
  }

  async function listInvites() {
    const { rows } = await db.query('SELECT id, label, max_sessions, sessions_used, created_by, created_at, expires_at, revoked_at FROM demo_invites ORDER BY created_at DESC LIMIT 200');
    return rows;
  }

  /** Owner-only on-chain emergency controls for the DEMO sandbox, signed by the server-held demo owner key. */
  async function emergency(action, by) {
    return ownerMutex.run(async()=>{
    if (!['pause', 'unpause', 'emergencyStop'].includes(action)) throw badRequest('INVALID_ACTION', 'Unknown emergency action');
    const contract = chain.contract.connect(ownerSigner);
    const gas=await contract[action].estimateGas(),fee=(await chain.provider.getFeeData()).maxFeePerGas;
    if(!fee || gas*2n*fee>demo.maxGasPerTxWei)throw forbidden('Emergency transaction fee exceeds the approved owner ceiling; use the owner wallet directly');
    const tx = await contract[action]({gasLimit:gas*2n,maxFeePerGas:fee});
    await repos.audit.append({ actor: by, action: `DEMO_CONTRACT_${action.toUpperCase()}`, entityType: 'contract', entityId: config.contractAddress, details: { txHash: tx.hash } });
    const rc = await tx.wait(1, 120000);
    return { action, txHash: tx.hash, status: rc?.status ?? null, explorerUrl: chain.txUrl(tx.hash) };
    });
  }

  async function executionSubject(p) {
    const row = (await db.query(`SELECT s.id FROM demo_actions a JOIN demo_sessions s ON s.id=a.session_id
      JOIN demo_invites i ON i.id=s.invite_id WHERE a.proposal_id=$1 AND a.confirmed_at IS NOT NULL
      AND s.execution_allowed=TRUE AND s.revoked_at IS NULL AND s.expires_at>now() AND i.revoked_at IS NULL
      AND (i.expires_at IS NULL OR i.expires_at>now())`, [p.id])).rows[0];
    if (!(await executionEnabled())) return null;
    if (row) return `demo:${row.id}`;
    if (p.taskRunId) {
      const g=(await db.query(`SELECT s.id FROM task_runs r JOIN demo_grants g ON g.task_id=r.task_id JOIN demo_sessions s ON s.id=g.session_id JOIN demo_invites i ON i.id=s.invite_id
        WHERE r.id=$1 AND g.confirmed_at IS NOT NULL AND g.revoked=FALSE AND s.execution_allowed=TRUE AND s.revoked_at IS NULL
        AND s.expires_at>now() AND i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at>now())`,[p.taskRunId])).rows[0];
      return g ? `demo:${g.id}` : null;
    }
    return null;
  }
  async function taskFor(session,id) {
    const row=(await db.query('SELECT * FROM demo_grants WHERE task_id=$1 AND session_id=$2',[id,session.id])).rows[0];
    if(!row) throw forbidden('Task belongs to another session');
    const task=await container.scheduler.get(id),td=grantTypedData(task);
    return {...task,grantDigest:ethers.TypedDataEncoder.hash(td.domain,td.types,td.message)};
  }
  async function createTask(session,{recipient,amount}) {
    const caps=await effectiveLimits(), per=ethers.parseEther(amount);
    if (per<=0n || per>ethers.parseEther(caps.maxAmountEth)) throw badRequest('DEMO_AMOUNT_LIMIT','Amount exceeds the demo ceiling');
    const now=Math.floor(Date.now()/1000);
    const t=await container.scheduler.create({title:'Judge confirmed bounded demo',token:ethers.ZeroAddress,recipient,amount,
      schedule:{type:'interval',everySeconds:30,startAt:now+5},maxRuns:2,maxTotal:ethers.formatEther(per*2n),validUntil:now+600,
      executionWindowSeconds:20,useRlTiming:false},owner);
    await db.query('INSERT INTO demo_grants(task_id,session_id) VALUES($1,$2)',[t.id,session.id]);
    return taskFor(session,t.id);
  }
  async function confirmGrant(session,id,digest) {
    if (!session.executionAllowed || !await executionEnabled()) throw forbidden('Invite and enabled execution are required');
    const t=await taskFor(session,id), typed=grantTypedData(t), expected=ethers.TypedDataEncoder.hash(typed.domain,typed.types,typed.message);
    if (digest!==expected) throw badRequest('CONFIRMATION_MISMATCH','Grant digest changed; review again');
    if (t.maxRuns!==2 || t.validUntil>Math.floor(Date.now()/1000)+600 || BigInt(t.amountWei)>demo.maxAmountWei) throw forbidden('Grant exceeds the approved bounds');
    const signature=await ownerSigner.signTypedData(typed.domain,typed.types,typed.message);
    const cap=await effectiveLimits();
    await db.tx(async(q)=>{
      const claimed=await q.query('UPDATE demo_grants SET confirmed_at=now(),digest=$3 WHERE task_id=$1 AND session_id=$2 AND confirmed_at IS NULL RETURNING task_id',[id,session.id,digest]);
      if(!claimed.rows.length) throw conflict('ALREADY_CONFIRMED','Grant already confirmed');
      const used=await q.query('UPDATE demo_sessions SET tx_count=tx_count+2 WHERE id=$1 AND tx_count+2<=$2 AND execution_allowed=TRUE AND revoked_at IS NULL AND expires_at>now() RETURNING id',[session.id,cap.maxTxPerSession]);
      if(!used.rows.length) throw forbidden('Session transaction budget exhausted');
      const g=await q.query(`INSERT INTO demo_daily_usage(day,tx_count,amount_wei) SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,2,$1 WHERE 2<=$2 AND $1::numeric<=$3
        ON CONFLICT(day) DO UPDATE SET tx_count=demo_daily_usage.tx_count+2,amount_wei=demo_daily_usage.amount_wei+$1
        WHERE demo_daily_usage.tx_count+2<=$2 AND demo_daily_usage.amount_wei+$1<=$3 RETURNING day`,[(BigInt(t.amountWei)*2n).toString(),cap.dailyTxLimit,ethers.parseEther(cap.dailyAmountEth).toString()]);
      if(!g.rows.length) throw forbidden('Global demo budget exhausted');
    });
    await container.scheduler.authorize(id,signature,{address:owner});
    return taskFor(session,id);
  }
  async function tasks(session) {
    const rows=(await db.query('SELECT task_id FROM demo_grants WHERE session_id=$1',[session.id])).rows;
    return Promise.all(rows.map((r)=>taskFor(session,r.task_id)));
  }
  async function runDue(session) {
    if (!session.executionAllowed || !await executionEnabled()) throw forbidden('Invite and enabled execution required');
    if(executing)throw conflict('DEMO_BUSY','A demo transaction is already running');
    executing=true;
    try { await executionMutex.run(async()=>{ await container.scheduler.tick();await container.executor.whenIdle();await container.scheduler.tick(); }); }
    finally {executing=false;}
    return tasks(session);
  }
  async function revokeTask(session,id) {
    const t=await taskFor(session,id);
    const changed=await db.query('UPDATE demo_grants SET revoked=TRUE WHERE task_id=$1 AND session_id=$2 AND revoked=FALSE RETURNING confirmed_at',[id,session.id]);
    if(!changed.rows.length) throw conflict('GRANT_REVOKED','Already revoked');
    await container.scheduler.cancel(id,{address:owner},'Judge revoked grant');
    if (changed.rows[0].confirmed_at) await ownerMutex.run(async()=>{
      const typed=grantTypedData(t),digest=ethers.TypedDataEncoder.hash(typed.domain,typed.types,typed.message), target=chain.contract.connect(ownerSigner);
      const gas=await target.revokeGrant.estimateGas(digest),fee=(await chain.provider.getFeeData()).maxFeePerGas;
      if(!fee || gas*2n*fee>demo.maxGasPerTxWei) throw forbidden('Revocation fee exceeds the owner gas ceiling; admin intervention required');
      const tx=await target.revokeGrant(digest,{gasLimit:gas*2n,maxFeePerGas:fee});await tx.wait(1,60000);
    });
    return taskFor(session,id);
  }
  return { init, startSession, authenticate, status, chat, conversations, conversation, getProposal, listProposals, confirm, setExecutionEnabled, createInvite, revokeInvite, listInvites, emergency, publicLimits, executionSubject,
    effectiveLimits,setLimits,createTask,confirmGrant,tasks,taskFor,runDue,revokeTask };
}
