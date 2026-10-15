import { toUnix } from '../lib/time.js';

const toDate = (unix) => (unix === null || unix === undefined ? null : new Date(Number(unix) * 1000));
const str = (v) => (v === null || v === undefined ? null : String(v));

export function mapTask(r) {
  if (!r) return null;
  return {
    id: r.id,
    createdBy: r.created_by,
    source: r.source,
    conversationId: r.conversation_id,
    kind: r.kind,
    status: r.status,
    title: r.title,
    chainId: Number(r.chain_id),
    contractAddress: r.contract_address,
    token: { address: r.token_address, symbol: r.token_symbol, decimals: Number(r.token_decimals) },
    recipient: r.recipient,
    amountWei: str(r.amount_wei),
    schedule: r.schedule,
    condition: r.condition,
    executionWindowSeconds: Number(r.execution_window_seconds),
    useRlTiming: Boolean(r.use_rl_timing),
    maxRuns: r.max_runs === null ? null : Number(r.max_runs),
    maxTotalWei: str(r.max_total_wei),
    validUntil: toUnix(r.valid_until),
    retryMaxAttempts: Number(r.retry_max_attempts),
    retryBackoffSeconds: Number(r.retry_backoff_seconds),
    grantTypedData: r.grant_typed_data,
    grantSignature: r.grant_signature,
    authorizedBy: r.authorized_by,
    authorizedAt: toUnix(r.authorized_at),
    runsCount: Number(r.runs_count),
    committedWei: str(r.committed_wei),
    consecutiveFailures: Number(r.consecutive_failures),
    nextRunAt: toUnix(r.next_run_at),
    leaseOwner: r.lease_owner,
    leaseUntil: toUnix(r.lease_until),
    lastError: r.last_error,
    statusReason: r.status_reason,
    createdAt: toUnix(r.created_at),
    updatedAt: toUnix(r.updated_at),
  };
}

export function mapRun(r) {
  if (!r) return null;
  return {
    id: r.id,
    taskId: r.task_id,
    runKey: r.run_key,
    scheduledFor: toUnix(r.scheduled_for),
    deadlineAt: toUnix(r.deadline_at),
    status: r.status,
    attempt: Number(r.attempt),
    proposalId: r.proposal_id,
    decision: r.decision,
    timingAdvice: r.timing_advice,
    errorCode: r.error_code,
    errorMessage: r.error_message,
    nextAttemptAt: toUnix(r.next_attempt_at),
    createdAt: toUnix(r.created_at),
    updatedAt: toUnix(r.updated_at),
  };
}

const TASK_FIELDS = {
  status: 'status', grantSignature: 'grant_signature', authorizedBy: 'authorized_by', authorizedAt: 'authorized_at',
  runsCount: 'runs_count', committedWei: 'committed_wei', consecutiveFailures: 'consecutive_failures',
  nextRunAt: 'next_run_at', lastError: 'last_error', statusReason: 'status_reason', leaseOwner: 'lease_owner', leaseUntil: 'lease_until',
};
const RUN_FIELDS = {
  status: 'status', attempt: 'attempt', proposalId: 'proposal_id', decision: 'decision', timingAdvice: 'timing_advice',
  errorCode: 'error_code', errorMessage: 'error_message', nextAttemptAt: 'next_attempt_at',
};
const isTime = (c) => c.endsWith('_at') || c === 'lease_until';

function setClause(fields, map, start) {
  const sets = [];
  const values = [];
  for (const [k, v] of Object.entries(fields)) {
    const col = map[k];
    if (!col) throw new Error(`Unknown field ${k}`);
    values.push(isTime(col) && typeof v === 'number' ? toDate(v) : col === 'decision' || col === 'timing_advice' ? (v === null ? null : JSON.stringify(v)) : v);
    sets.push(`${col} = $${start + values.length - 1}`);
  }
  return { sets, values };
}

export function createAutonomyRepositories(db) {
  const tasks = {
    async insert(t) {
      const { rows } = await db.query(
        `INSERT INTO tasks (id, created_by, source, conversation_id, kind, status, title, chain_id, contract_address,
           token_address, token_symbol, token_decimals, recipient, amount_wei, schedule, condition, execution_window_seconds,
           use_rl_timing, max_runs, max_total_wei, valid_until, retry_max_attempts, retry_backoff_seconds, grant_typed_data, next_run_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING *`,
        [t.id, t.createdBy, t.source, t.conversationId || null, t.kind, t.status, t.title, t.chainId, t.contractAddress,
          t.token.address, t.token.symbol, t.token.decimals, t.recipient, t.amountWei, JSON.stringify(t.schedule),
          t.condition ? JSON.stringify(t.condition) : null, t.executionWindowSeconds, t.useRlTiming, t.maxRuns, t.maxTotalWei,
          toDate(t.validUntil), t.retryMaxAttempts, t.retryBackoffSeconds, JSON.stringify(t.grantTypedData), toDate(t.nextRunAt)],
      );
      return mapTask(rows[0]);
    },
    async findById(id) {
      if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
      return mapTask((await db.query('SELECT * FROM tasks WHERE id = $1', [id])).rows[0]);
    },
    async list({ status = null, limit = 100 } = {}) {
      const { rows } = status
        ? await db.query('SELECT * FROM tasks WHERE status = ANY($1) ORDER BY created_at DESC LIMIT $2', [status, limit])
        : await db.query('SELECT * FROM tasks ORDER BY created_at DESC LIMIT $1', [limit]);
      return rows.map(mapTask);
    },
    /** Compare-and-set status change (plus extra fields). Returns null if the row was not in `from`. */
    async transition(id, from, to, fields = {}) {
      const { sets, values } = setClause(fields, TASK_FIELDS, 4);
      const { rows } = await db.query(
        `UPDATE tasks SET status = $3, updated_at = now()${sets.length ? ', ' + sets.join(', ') : ''} WHERE id = $1 AND status = ANY($2) RETURNING *`,
        [id, from, to, ...values],
      );
      return mapTask(rows[0]);
    },
    async update(id, fields) {
      const { sets, values } = setClause(fields, TASK_FIELDS, 2);
      const { rows } = await db.query(`UPDATE tasks SET updated_at = now(), ${sets.join(', ')} WHERE id = $1 RETURNING *`, [id, ...values]);
      return mapTask(rows[0]);
    },
    /**
     * Atomically leases due tasks to one scheduler instance. Two concurrent ticks can never lease the
     * same task: the UPDATE only matches rows whose lease is free or expired.
     */
    async leaseDue(owner, leaseSeconds, limit = 20) {
      const { rows } = await db.query(
        `UPDATE tasks SET lease_owner = $1, lease_until = now() + ($2 || ' seconds')::interval, updated_at = now()
         WHERE id IN (
           SELECT id FROM tasks
           WHERE status = 'ACTIVE' AND next_run_at IS NOT NULL AND next_run_at <= now()
             AND (lease_until IS NULL OR lease_until < now())
           ORDER BY next_run_at LIMIT $3
         ) AND (lease_until IS NULL OR lease_until < now())
         RETURNING *`,
        [owner, String(leaseSeconds), limit],
      );
      return rows.map(mapTask);
    },
    async release(id, owner, fields = {}) {
      const { sets, values } = setClause(fields, TASK_FIELDS, 3);
      const { rows } = await db.query(
        `UPDATE tasks SET lease_owner = NULL, lease_until = NULL, updated_at = now()${sets.length ? ', ' + sets.join(', ') : ''}
         WHERE id = $1 AND lease_owner = $2 RETURNING *`,
        [id, owner, ...values],
      );
      return mapTask(rows[0]);
    },
    /** Reserve one run against the grant bounds atomically; returns null if the bounds would be exceeded. */
    async reserveRun(id, amountWei) {
      const { rows } = await db.query(
        `UPDATE tasks SET runs_count = runs_count + 1, committed_wei = committed_wei + $2::numeric, updated_at = now()
         WHERE id = $1 AND (max_runs IS NULL OR runs_count < max_runs)
           AND (max_total_wei IS NULL OR committed_wei + $2::numeric <= max_total_wei) RETURNING *`,
        [id, amountWei],
      );
      return mapTask(rows[0]);
    },
    async releaseRun(id, amountWei) {
      const { rows } = await db.query(
        `UPDATE tasks SET runs_count = GREATEST(runs_count - 1, 0), committed_wei = GREATEST(committed_wei - $2::numeric, 0), updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, amountWei],
      );
      return mapTask(rows[0]);
    },
    async committedOutflows() {
      const { rows } = await db.query(`SELECT * FROM tasks WHERE status IN ('ACTIVE', 'PENDING_AUTHORIZATION')`);
      return rows.map(mapTask);
    },
  };

  const runs = {
    /** Idempotent: one row per (task, occurrence). Returns { run, created }. */
    async getOrCreate({ taskId, scheduledFor, deadlineAt }) {
      const runKey = `${taskId}:${scheduledFor}`;
      const ins = await db.query(
        `INSERT INTO task_runs (task_id, run_key, scheduled_for, deadline_at, status) VALUES ($1,$2,$3,$4,'PENDING')
         ON CONFLICT (run_key) DO NOTHING RETURNING *`,
        [taskId, runKey, toDate(scheduledFor), toDate(deadlineAt)],
      );
      if (ins.rows.length) return { run: mapRun(ins.rows[0]), created: true };
      return { run: mapRun((await db.query('SELECT * FROM task_runs WHERE run_key = $1', [runKey])).rows[0]), created: false };
    },
    async transition(id, from, to, fields = {}) {
      const { sets, values } = setClause(fields, RUN_FIELDS, 4);
      const { rows } = await db.query(
        `UPDATE task_runs SET status = $3, updated_at = now()${sets.length ? ', ' + sets.join(', ') : ''} WHERE id = $1 AND status = ANY($2) RETURNING *`,
        [id, from, to, ...values],
      );
      return mapRun(rows[0]);
    },
    /** Claims an attempt: compare-and-set on status AND attempt, so exactly one caller wins. */
    async claim(id, from, expectedAttempt) {
      const { rows } = await db.query(
        `UPDATE task_runs SET status = 'CLAIMED', attempt = attempt + 1, updated_at = now()
         WHERE id = $1 AND status = ANY($2) AND attempt = $3 RETURNING *`,
        [id, from, expectedAttempt],
      );
      return mapRun(rows[0]);
    },
    async update(id, fields) {
      const { sets, values } = setClause(fields, RUN_FIELDS, 2);
      const { rows } = await db.query(`UPDATE task_runs SET updated_at = now(), ${sets.join(', ')} WHERE id = $1 RETURNING *`, [id, ...values]);
      return mapRun(rows[0]);
    },
    async staleClaims(olderThanSeconds) {
      const { rows } = await db.query(
        `SELECT * FROM task_runs WHERE status = 'CLAIMED' AND updated_at < now() - ($1 || ' seconds')::interval`, [String(olderThanSeconds)]);
      return rows.map(mapRun);
    },
    async listForTask(taskId, limit = 50) {
      const { rows } = await db.query('SELECT * FROM task_runs WHERE task_id = $1 ORDER BY scheduled_for DESC, created_at DESC LIMIT $2', [taskId, limit]);
      return rows.map(mapRun);
    },
    async listOpen() {
      const { rows } = await db.query(`SELECT * FROM task_runs WHERE status IN ('PENDING', 'DEFERRED', 'ESCALATED', 'EXECUTING', 'RETRY_WAIT') ORDER BY created_at`);
      return rows.map(mapRun);
    },
    async findById(id) {
      return mapRun((await db.query('SELECT * FROM task_runs WHERE id = $1', [id])).rows[0]);
    },
    async recentAutonomousOutflow(tokenAddress, sinceSeconds) {
      const { rows } = await db.query(
        `SELECT COALESCE(SUM(p.amount_wei), 0)::text AS total FROM task_runs r JOIN proposals p ON p.id = r.proposal_id
         WHERE p.token_address = $1 AND p.approval_kind = 'TASK_GRANT' AND p.status IN ('APPROVED', 'SUBMITTED', 'CONFIRMED')
           AND p.approved_at > now() - ($2 || ' seconds')::interval`,
        [tokenAddress, String(sinceSeconds)],
      );
      return BigInt(rows[0].total);
    },
  };

  const market = {
    async addGasSample({ chainId, blockNumber, gasPriceWei, baseFeeWei }) {
      await db.query('INSERT INTO gas_samples (chain_id, block_number, gas_price_wei, base_fee_wei) VALUES ($1,$2,$3,$4)', [chainId, blockNumber, gasPriceWei, baseFeeWei]);
    },
    async recentGas(chainId, limit = 64) {
      const { rows } = await db.query('SELECT * FROM gas_samples WHERE chain_id = $1 ORDER BY sampled_at DESC, id DESC LIMIT $2', [chainId, limit]);
      return rows.reverse().map((r) => ({ blockNumber: Number(r.block_number), gasPriceWei: String(r.gas_price_wei), sampledAt: toUnix(r.sampled_at) }));
    },
    async lastGasSampleAt(chainId) {
      const { rows } = await db.query('SELECT max(sampled_at) AS t FROM gas_samples WHERE chain_id = $1', [chainId]);
      return toUnix(rows[0].t);
    },
    async addBalanceSnapshot(s) {
      await db.query('INSERT INTO balance_snapshots (chain_id, block_number, token_address, balance, price_usd, price_source) VALUES ($1,$2,$3,$4,$5,$6)',
        [s.chainId, s.blockNumber, s.tokenAddress, s.balance, s.priceUsd, s.priceSource]);
    },
    async balanceHistory(tokenAddress, limit = 200) {
      const { rows } = await db.query('SELECT * FROM balance_snapshots WHERE token_address = $1 ORDER BY taken_at DESC LIMIT $2', [tokenAddress, limit]);
      return rows.reverse().map((r) => ({ blockNumber: Number(r.block_number), balance: String(r.balance), priceUsd: r.price_usd === null ? null : String(r.price_usd).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''), priceSource: r.price_source, takenAt: toUnix(r.taken_at) }));
    },
    async lastSnapshotAt(chainId) {
      const { rows } = await db.query('SELECT max(taken_at) AS t FROM balance_snapshots WHERE chain_id = $1', [chainId]);
      return toUnix(rows[0].t);
    },
  };

  const memory = {
    async createConversation(owner, title) {
      return (await db.query('INSERT INTO conversations (owner, title) VALUES ($1, $2) RETURNING *', [owner, title])).rows[0];
    },
    async getConversation(id) {
      if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
      return (await db.query('SELECT * FROM conversations WHERE id = $1', [id])).rows[0] || null;
    },
    async listConversations(owner) {
      return (await db.query('SELECT * FROM conversations WHERE owner = $1 ORDER BY updated_at DESC LIMIT 50', [owner])).rows;
    },
    async touchConversation(id) {
      await db.query('UPDATE conversations SET updated_at = now() WHERE id = $1', [id]);
    },
    async createTurn(conversationId, userMessage, provider, model) {
      return (await db.query(`INSERT INTO agent_turns (conversation_id, user_message, status, provider, model) VALUES ($1,$2,'RUNNING',$3,$4) RETURNING *`,
        [conversationId, userMessage, provider, model])).rows[0];
    },
    async finishTurn(id, { status, finalText = null, plan = null, actions = [], error = null, usage = null, modelCalls = 0 }) {
      return (await db.query(
        `UPDATE agent_turns SET status = $2, final_text = $3, plan = $4, actions = $5, error = $6, usage = $7, model_calls = $8, completed_at = now() WHERE id = $1 RETURNING *`,
        [id, status, finalText, plan ? JSON.stringify(plan) : null, JSON.stringify(actions), error, usage ? JSON.stringify(usage) : null, modelCalls],
      )).rows[0];
    },
    async addMessage(conversationId, turnId, role, content, provider = null) {
      await db.query('INSERT INTO conversation_messages (conversation_id, turn_id, role, content, provider) VALUES ($1,$2,$3,$4,$5)',
        [conversationId, turnId, role, JSON.stringify(content), provider]);
    },
    async messages(conversationId) {
      return (await db.query('SELECT * FROM conversation_messages WHERE conversation_id = $1 ORDER BY id', [conversationId])).rows;
    },
    async turns(conversationId) {
      return (await db.query('SELECT * FROM agent_turns WHERE conversation_id = $1 ORDER BY created_at', [conversationId])).rows;
    },
    async addToolInvocation({ turnId, conversationId, toolName, input, output, status, error }) {
      return (await db.query(
        'INSERT INTO tool_invocations (turn_id, conversation_id, tool_name, input, output, status, error) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [turnId, conversationId, toolName, JSON.stringify(input ?? null), output === undefined ? null : JSON.stringify(output), status, error || null],
      )).rows[0];
    },
    async toolInvocations(conversationId) {
      return (await db.query('SELECT * FROM tool_invocations WHERE conversation_id = $1 ORDER BY created_at', [conversationId])).rows;
    },
  };

  return { tasks, runs, market, memory };
}
