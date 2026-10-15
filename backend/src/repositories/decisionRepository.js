import { pool } from '../config/database.js';

class DecisionRepository {
  constructor() {
    this.memoryStore = new Map();
  }

  async save(decision) {
    this.memoryStore.set(decision.decisionId, decision);

    if (pool) {
      try {
        const query = `
          INSERT INTO agent_decisions (
            decision_id, agent_type, model_version, action_index, action_type,
            proposed_recipient, proposed_amount_eth, confidence_score, rationale,
            q_values, policy_distribution, observed_state, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TO_TIMESTAMP($13))
          ON CONFLICT (decision_id) DO NOTHING;
        `;
        const values = [
          decision.decisionId,
          decision.agentType,
          decision.modelVersion,
          decision.actionIndex,
          decision.actionType,
          decision.proposedParameters?.recipient || null,
          decision.proposedParameters?.amountEth || 0.0,
          decision.confidenceScore,
          decision.rationale,
          JSON.stringify(decision.qValues || null),
          JSON.stringify(decision.policyDistribution || null),
          JSON.stringify(decision.observedState || {}),
          decision.createdAt || Math.floor(Date.now() / 1000)
        ];
        await pool.query(query, values);
      } catch (err) {
        console.warn('[DecisionRepo DB Warning]: Failed to persist to postgres, kept in memory:', err.message);
      }
    }
    return decision;
  }

  async findById(decisionId) {
    if (this.memoryStore.has(decisionId)) {
      return this.memoryStore.get(decisionId);
    }
    if (pool) {
      try {
        const res = await pool.query('SELECT * FROM agent_decisions WHERE decision_id = $1', [decisionId]);
        if (res.rows.length > 0) return res.rows[0];
      } catch (err) {
        console.warn('[DecisionRepo findById Warning]:', err.message);
      }
    }
    return null;
  }

  async listRecent(limit = 20) {
    if (pool) {
      try {
        const res = await pool.query('SELECT * FROM agent_decisions ORDER BY created_at DESC LIMIT $1', [limit]);
        if (res.rows.length > 0) return res.rows;
      } catch (err) {
        console.warn('[DecisionRepo listRecent Warning]:', err.message);
      }
    }
    return Array.from(this.memoryStore.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
}

export const decisionRepository = new DecisionRepository();
