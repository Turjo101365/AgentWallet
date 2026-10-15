import { pool } from '../config/database.js';

class ApprovalRepository {
  constructor() {
    this.memoryStore = new Map();
  }

  async save(approval) {
    this.memoryStore.set(approval.decisionId, approval);

    if (pool) {
      try {
        const query = `
          INSERT INTO user_approvals (
            approval_id, decision_id, status, signer_address, rejection_reason,
            ttl_seconds, expires_at, resolved_at
          ) VALUES ($1, $2, $3, $4, $5, $6, TO_TIMESTAMP($7), $8)
          ON CONFLICT (approval_id) DO UPDATE SET
            status = EXCLUDED.status,
            signer_address = EXCLUDED.signer_address,
            rejection_reason = EXCLUDED.rejection_reason,
            resolved_at = EXCLUDED.resolved_at;
        `;
        await pool.query(query, [
          approval.approvalId || approval.decisionId,
          approval.decisionId,
          approval.status,
          approval.signerAddress || null,
          approval.rejectionReason || null,
          approval.ttlSeconds || 180,
          approval.expiresAt || Math.floor(Date.now() / 1000) + 180,
          approval.resolvedAt ? new Date(approval.resolvedAt * 1000) : null
        ]);
      } catch (err) {
        console.warn('[ApprovalRepo DB Warning]:', err.message);
      }
    }
    return approval;
  }

  async findByDecisionId(decisionId) {
    if (this.memoryStore.has(decisionId)) {
      return this.memoryStore.get(decisionId);
    }
    if (pool) {
      try {
        const res = await pool.query('SELECT * FROM user_approvals WHERE decision_id = $1', [decisionId]);
        if (res.rows.length > 0) return res.rows[0];
      } catch (err) {
        console.warn('[ApprovalRepo find Warning]:', err.message);
      }
    }
    return null;
  }

  async listPending() {
    const now = Math.floor(Date.now() / 1000);
    return Array.from(this.memoryStore.values())
      .filter(a => a.status === 'AWAITING_APPROVAL' && a.expiresAt > now);
  }
}

export const approvalRepository = new ApprovalRepository();
