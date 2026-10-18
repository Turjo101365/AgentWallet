import crypto from 'node:crypto';
import { Mutex } from '../lib/mutex.js';
import { mapProposal, mapExecution, mapChainEvent, mapDecision, mapAudit } from './mappers.js';
import { createAutonomyRepositories } from './autonomy.js';

const PROPOSAL_FIELDS = {
  approvedBy: 'approved_by',
  approvalSignature: 'approval_signature',
  approvedAt: 'approved_at',
  resolvedBy: 'resolved_by',
  resolutionReason: 'resolution_reason',
  resolvedAt: 'resolved_at',
  policyResult: 'policy_result',
  simulation: 'simulation',
  approvalKind: 'approval_kind',
  explanation: 'explanation',
};

const EXECUTION_FIELDS = {
  status: 'status',
  nonce: 'nonce',
  txHash: 'tx_hash',
  gasLimit: 'gas_limit',
  maxFeePerGas: 'max_fee_per_gas',
  gasUsed: 'gas_used',
  effectiveGasPrice: 'effective_gas_price',
  blockNumber: 'block_number',
  blockHash: 'block_hash',
  errorCode: 'error_code',
  errorMessage: 'error_message',
  submittedAt: 'submitted_at',
  confirmedAt: 'confirmed_at',
};

const toDate = (unix) => (unix === null || unix === undefined ? null : new Date(Number(unix) * 1000));
const isTimestampColumn = (col) => col.endsWith('_at');

function buildSet(fields, columnMap, startIndex) {
  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(fields)) {
    const column = columnMap[key];
    if (!column) throw new Error(`Unknown field ${key}`);
    values.push(isTimestampColumn(column) && typeof value === 'number' ? toDate(value) : value);
    sets.push(`${column} = $${startIndex + values.length - 1}`);
  }
  return { sets, values };
}

export function createRepositories(db) {
  const proposals = {
    async insert(p, q = db) {
      const { rows } = await q.query(
        `INSERT INTO proposals (id, intent_id, source, decision_id, created_by, chain_id, contract_address,
           token_address, token_symbol, token_decimals, recipient, amount_wei, memo, status,
           policy_result, simulation, expires_at, task_run_id, explanation)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
        [
          p.id, p.intentId, p.source, p.decisionId || null, p.createdBy, p.chainId, p.contractAddress,
          p.token.address, p.token.symbol, p.token.decimals, p.recipient, p.amountWei, p.memo || null,
          p.status, p.policyResult, p.simulation || null, toDate(p.expiresAt), p.taskRunId || null, p.explanation || null,
        ],
      );
      return mapProposal(rows[0]);
    },

    async findById(id, q = db) {
      if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
      const { rows } = await q.query('SELECT * FROM proposals WHERE id = $1', [id]);
      return mapProposal(rows[0]);
    },

    async findByTaskRun(taskRunId) {
      const { rows } = await db.query('SELECT * FROM proposals WHERE task_run_id = $1 ORDER BY created_at DESC LIMIT 1', [taskRunId]);
      return mapProposal(rows[0]);
    },

    async findByIntentId(intentId, q = db) {
      const { rows } = await q.query('SELECT * FROM proposals WHERE intent_id = $1', [intentId]);
      return mapProposal(rows[0]);
    },

    async list({ status = null, limit = 50 } = {}) {
      const { rows } = status
        ? await db.query('SELECT * FROM proposals WHERE status = ANY($1) ORDER BY created_at DESC LIMIT $2', [status, limit])
        : await db.query('SELECT * FROM proposals ORDER BY created_at DESC LIMIT $1', [limit]);
      return rows.map(mapProposal);
    },

    /**
     * Atomic compare-and-set on status. Returns the updated proposal, or null when the row was not
     * in one of `from` (or had expired, when requireUnexpired). This is the only way statuses change.
     */
    async transition(id, from, to, fields = {}, { requireUnexpired = false } = {}, q = db) {
      const { sets, values } = buildSet(fields, PROPOSAL_FIELDS, 4);
      const expiry = requireUnexpired ? 'AND expires_at > now()' : '';
      const { rows } = await q.query(
        `UPDATE proposals SET status = $3, updated_at = now()${sets.length ? ', ' + sets.join(', ') : ''}
         WHERE id = $1 AND status = ANY($2) ${expiry} RETURNING *`,
        [id, from, to, ...values],
      );
      return mapProposal(rows[0]);
    },

    /** Include confirmations newer than the pinned snapshot: they are not in its balance/spend yet. */
    async listCommitted(tokenAddress, excludeId = null, blockTag = null, q = db) {
      const { rows } = await q.query(
        `SELECT intent_id, amount_wei::text AS amount_wei, status FROM proposals
         WHERE token_address = $1 AND (status IN ('APPROVED', 'SUBMITTED') OR
           (status='FAILED' AND EXISTS (SELECT 1 FROM executions e WHERE e.proposal_id=proposals.id AND e.tx_hash IS NOT NULL AND e.block_number IS NULL)) OR
           (status='CONFIRMED' AND $3::bigint IS NOT NULL AND EXISTS (SELECT 1 FROM executions e WHERE e.proposal_id=proposals.id AND (e.block_number IS NULL OR e.block_number>$3::bigint))))
         AND ($2::uuid IS NULL OR id <> $2::uuid)`,
        [tokenAddress, excludeId, blockTag],
      );
      return rows.map((r) => ({ intentId: r.intent_id, amountWei: BigInt(r.amount_wei), status: r.status }));
    },

    async expireStale() {
      const { rows } = await db.query(
        `UPDATE proposals SET status = 'EXPIRED', updated_at = now(), resolved_at = now(), resolution_reason = 'TTL elapsed'
         WHERE status = 'AWAITING_APPROVAL' AND expires_at <= now() RETURNING *`,
      );
      return rows.map(mapProposal);
    },
  };

  const executions = {
    /** Creates the single execution row for a proposal. Returns null if one already exists. */
    async create({ proposalId, intentId, executorAddress }, q = db) {
      const { rows } = await q.query(
        `INSERT INTO executions (proposal_id, intent_id, executor_address, status)
         VALUES ($1, $2, $3, 'PREPARING') ON CONFLICT (proposal_id) DO NOTHING RETURNING *`,
        [proposalId, intentId, executorAddress],
      );
      return mapExecution(rows[0]);
    },

    async update(id, fields, q = db) {
      const { sets, values } = buildSet(fields, EXECUTION_FIELDS, 2);
      const { rows } = await q.query(
        `UPDATE executions SET updated_at = now(), ${sets.join(', ')} WHERE id = $1 RETURNING *`,
        [id, ...values],
      );
      return mapExecution(rows[0]);
    },

    async findByProposal(proposalId, q = db) {
      const { rows } = await q.query('SELECT * FROM executions WHERE proposal_id = $1', [proposalId]);
      return mapExecution(rows[0]);
    },

    async findByIntentId(intentId) {
      const { rows } = await db.query('SELECT * FROM executions WHERE intent_id = $1', [intentId]);
      return mapExecution(rows[0]);
    },

    async listByStatus(statuses) {
      const { rows } = await db.query('SELECT * FROM executions WHERE status = ANY($1) ORDER BY created_at', [statuses]);
      return rows.map(mapExecution);
    },

    async listRecent(limit = 50) {
      const { rows } = await db.query('SELECT * FROM executions ORDER BY created_at DESC LIMIT $1', [limit]);
      return rows.map(mapExecution);
    },
  };

  const auth = {
    async createNonce({ nonce, address, message, expiresAt }) {
      await db.query('INSERT INTO auth_nonces (nonce, address, message, expires_at) VALUES ($1, $2, $3, $4)', [
        nonce, address, message, toDate(expiresAt),
      ]);
    },

    /** Marks a nonce used exactly once. Returns the row only if it was unused and unexpired. */
    async consumeNonce(nonce) {
      const { rows } = await db.query(
        `UPDATE auth_nonces SET used_at = now() WHERE nonce = $1 AND used_at IS NULL AND expires_at > now() RETURNING *`,
        [nonce],
      );
      return rows[0] || null;
    },

    async createSession({ tokenHash, address, expiresAt }) {
      const { rows } = await db.query(
        'INSERT INTO sessions (token_hash, address, expires_at) VALUES ($1, $2, $3) RETURNING *',
        [tokenHash, address, toDate(expiresAt)],
      );
      return rows[0];
    },

    async findActiveSession(tokenHash) {
      const { rows } = await db.query(
        `UPDATE sessions SET last_seen_at = now()
         WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now() RETURNING *`,
        [tokenHash],
      );
      return rows[0] || null;
    },

    async revokeSession(id) {
      await db.query('UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [id]);
    },

    async purgeExpiredNonces() {
      await db.query(`DELETE FROM auth_nonces WHERE expires_at < now() - interval '1 day'`);
    },
  };

  const settings = {
    async get(key, fallback = null) {
      const { rows } = await db.query('SELECT value FROM settings WHERE key = $1', [key]);
      return rows.length ? rows[0].value : fallback;
    },
    async set(key, value, updatedBy) {
      await db.query(
        `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [key, JSON.stringify(value), updatedBy],
      );
    },
  };

  const idempotency = {
    /**
     * Claims a key for a request. Outcomes: 'new' (caller proceeds), 'replay' (return stored response),
     * 'mismatch' (key reused for a different request) or 'in_progress' (concurrent duplicate).
     */
    async begin(key, scope, requestHash) {
      const { rows } = await db.query(
        `INSERT INTO idempotency_keys (key, scope, request_hash) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING RETURNING key`,
        [key, scope, requestHash],
      );
      if (rows.length) return { state: 'new' };
      const existing = (await db.query('SELECT * FROM idempotency_keys WHERE key = $1', [key])).rows[0];
      if (existing.scope !== scope || existing.request_hash !== requestHash) return { state: 'mismatch' };
      if (existing.completed_at === null) return { state: 'in_progress' };
      return { state: 'replay', statusCode: existing.status_code, response: existing.response };
    },
    async complete(key, statusCode, response) {
      await db.query('UPDATE idempotency_keys SET status_code = $2, response = $3, completed_at = now() WHERE key = $1', [
        key, statusCode, JSON.stringify(response),
      ]);
    },
    async release(key) {
      await db.query('DELETE FROM idempotency_keys WHERE key = $1 AND completed_at IS NULL', [key]);
    },
  };

  const chainEvents = {
    async insertMany(events, q = db) {
      for (const ev of events) {
        await q.query(
          `INSERT INTO chain_events (chain_id, contract_address, block_number, block_hash, block_timestamp,
             tx_hash, log_index, event_name, args)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (chain_id, tx_hash, log_index) DO NOTHING`,
          [ev.chainId, ev.contractAddress, ev.blockNumber, ev.blockHash, ev.blockTimestamp, ev.txHash, ev.logIndex,
            ev.eventName, JSON.stringify(ev.args)],
        );
      }
    },
    async deleteFromBlock(chainId, fromBlock, q = db) {
      await q.query('DELETE FROM chain_events WHERE chain_id = $1 AND block_number >= $2', [chainId, fromBlock]);
    },
    async list({ limit = 100, eventNames = null } = {}) {
      const { rows } = eventNames
        ? await db.query('SELECT * FROM chain_events WHERE event_name = ANY($1) ORDER BY block_number DESC, log_index DESC LIMIT $2', [eventNames, limit])
        : await db.query('SELECT * FROM chain_events ORDER BY block_number DESC, log_index DESC LIMIT $1', [limit]);
      return rows.map(mapChainEvent);
    },
    async listByTx(txHash) {
      const { rows } = await db.query('SELECT * FROM chain_events WHERE tx_hash = $1 ORDER BY log_index', [txHash]);
      return rows.map(mapChainEvent);
    },
    async getState(id) {
      const { rows } = await db.query('SELECT * FROM indexer_state WHERE id = $1', [id]);
      return rows[0] ? { lastBlock: Number(rows[0].last_block), lastBlockHash: rows[0].last_block_hash } : null;
    },
    async setState(id, { chainId, contractAddress, lastBlock, lastBlockHash }, q = db) {
      await q.query(
        `INSERT INTO indexer_state (id, chain_id, contract_address, last_block, last_block_hash) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET last_block = EXCLUDED.last_block, last_block_hash = EXCLUDED.last_block_hash, updated_at = now()`,
        [id, chainId, contractAddress, lastBlock, lastBlockHash],
      );
    },
  };

  const decisions = {
    async insert(d) {
      const { rows } = await db.query(
        `INSERT INTO agent_decisions (agent_type, model_version, policy_source, action_index, action_type,
           suggested_amount_wei, confidence, rationale, observation, raw_response, outcome, requested_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [d.agentType, d.modelVersion, d.policySource, d.actionIndex, d.actionType, d.suggestedAmountWei,
          d.confidence, d.rationale, JSON.stringify(d.observation), JSON.stringify(d.rawResponse), d.outcome, d.requestedBy],
      );
      return mapDecision(rows[0]);
    },
    async attachProposal(id, proposalId, outcome) {
      await db.query('UPDATE agent_decisions SET proposal_id = $2, outcome = $3 WHERE id = $1', [id, proposalId, outcome]);
    },
    async list(limit = 50) {
      const { rows } = await db.query('SELECT * FROM agent_decisions ORDER BY created_at DESC LIMIT $1', [limit]);
      return rows.map(mapDecision);
    },
  };

  const recipientLabels = {
    async upsert(address, label, updatedBy, category = null) {
      await db.query(
        `INSERT INTO recipient_labels (address, label, updated_by, category) VALUES ($1, $2, $3, $4)
         ON CONFLICT (address) DO UPDATE SET label = EXCLUDED.label, category = EXCLUDED.category, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [address, label, updatedBy, category],
      );
    },
    async allDetailed() {
      const { rows } = await db.query('SELECT address, label, category FROM recipient_labels');
      return new Map(rows.map((r) => [r.address, { label: r.label, category: r.category }]));
    },
    async all() {
      const { rows } = await db.query('SELECT address, label FROM recipient_labels');
      return new Map(rows.map((r) => [r.address, r.label]));
    },
  };

  const auditMutex = new Mutex();
  const GENESIS = '0'.repeat(64);
  // jsonb reorders object keys, so the hash input must use a key-sorted serialization.
  const stable = (v) =>
    Array.isArray(v)
      ? `[${v.map(stable).join(',')}]`
      : v && typeof v === 'object'
        ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
        : JSON.stringify(v ?? null);
  const canonical = (entry) =>
    stable([entry.occurredAt, entry.actor, entry.action, entry.entityType, entry.entityId ?? null, entry.details]);
  const hashEntry = (prevHash, entry) => crypto.createHash('sha256').update(prevHash + canonical(entry)).digest('hex');

  const audit = {
    /** Appends a hash-chained record. Serialized so prev_hash always refers to the latest row. */
    append({ actor, action, entityType, entityId = null, details = {} }) {
      return auditMutex.run(() =>
        db.tx(async (t) => {
          // The in-process mutex cannot protect a hash chain shared by multiple
          // backend instances. Serialize append transactions in this schema too.
          if (db.kind === 'postgres') await t.query('SELECT pg_advisory_xact_lock(hashtext(current_schema()), 707)');
          const last = (await t.query('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1')).rows[0];
          const prevHash = last ? last.hash : GENESIS;
          const entry = {
            occurredAt: new Date().toISOString(),
            actor,
            action,
            entityType,
            entityId: entityId === null ? null : String(entityId),
            details: JSON.parse(JSON.stringify(details, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))),
          };
          const hash = hashEntry(prevHash, entry);
          const { rows } = await t.query(
            `INSERT INTO audit_log (occurred_at, actor, action, entity_type, entity_id, details, prev_hash, hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [entry.occurredAt, actor, action, entityType, entry.entityId, JSON.stringify(entry.details), prevHash, hash],
          );
          return mapAudit(rows[0]);
        }),
      );
    },

    async list({ limit = 100, entityId = null } = {}) {
      const { rows } = entityId
        ? await db.query('SELECT * FROM audit_log WHERE entity_id = $1 ORDER BY id DESC LIMIT $2', [String(entityId), limit])
        : await db.query('SELECT * FROM audit_log ORDER BY id DESC LIMIT $1', [limit]);
      return rows.map(mapAudit);
    },

    /** Recomputes the full hash chain. Detects edits made by anyone bypassing the trigger. */
    async verify() {
      const { rows } = await db.query('SELECT * FROM audit_log ORDER BY id ASC');
      let prev = GENESIS;
      for (const row of rows) {
        const e = mapAudit(row);
        const entry = { occurredAt: e.occurredAt, actor: e.actor, action: e.action, entityType: e.entityType, entityId: e.entityId, details: e.details };
        if (e.prevHash !== prev || hashEntry(prev, entry) !== e.hash) {
          return { valid: false, entries: rows.length, brokenAt: e.id };
        }
        prev = e.hash;
      }
      return { valid: true, entries: rows.length, head: prev };
    },
  };

  return { proposals, executions, auth, settings, idempotency, chainEvents, decisions, recipientLabels, audit, ...createAutonomyRepositories(db) };
}
