import { pool } from '../config/database.js';

class TransactionRepository {
  constructor() {
    this.memoryStore = new Map();
  }

  async save(tx) {
    const key = tx.txHash || tx.id;
    this.memoryStore.set(key, tx);

    if (pool && tx.txHash) {
      try {
        const query = `
          INSERT INTO tracked_transactions (
            id, tx_hash, decision_id, chain_id, from_address, to_address,
            value_wei, value_eth, calldata, status, block_number, confirmations,
            gas_used, effective_gas_price_gwei, submitted_at, confirmed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TO_TIMESTAMP($15), $16)
          ON CONFLICT (tx_hash) DO UPDATE SET
            status = EXCLUDED.status,
            block_number = EXCLUDED.block_number,
            confirmations = EXCLUDED.confirmations,
            gas_used = EXCLUDED.gas_used,
            effective_gas_price_gwei = EXCLUDED.effective_gas_price_gwei,
            confirmed_at = EXCLUDED.confirmed_at;
        `;
        await pool.query(query, [
          tx.id,
          tx.txHash,
          tx.decisionId || null,
          tx.chainId,
          tx.fromAddress,
          tx.toAddress,
          tx.valueWei,
          tx.valueEth,
          tx.calldata || null,
          tx.status,
          tx.blockNumber || null,
          tx.confirmations || 0,
          tx.gasUsed || null,
          tx.effectiveGasPriceGwei || null,
          tx.submittedAt || Math.floor(Date.now() / 1000),
          tx.confirmedAt ? new Date(tx.confirmedAt * 1000) : null
        ]);
      } catch (err) {
        console.warn('[TransactionRepo DB Warning]:', err.message);
      }
    }
    return tx;
  }

  async findByHash(txHash) {
    if (this.memoryStore.has(txHash)) {
      return this.memoryStore.get(txHash);
    }
    if (pool) {
      try {
        const res = await pool.query('SELECT * FROM tracked_transactions WHERE tx_hash = $1', [txHash]);
        if (res.rows.length > 0) return res.rows[0];
      } catch (err) {
        console.warn('[TransactionRepo findByHash Warning]:', err.message);
      }
    }
    return null;
  }

  async listRecent(limit = 20) {
    if (pool) {
      try {
        const res = await pool.query('SELECT * FROM tracked_transactions ORDER BY submitted_at DESC LIMIT $1', [limit]);
        if (res.rows.length > 0) return res.rows;
      } catch (err) {
        console.warn('[TransactionRepo listRecent Warning]:', err.message);
      }
    }
    return Array.from(this.memoryStore.values())
      .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))
      .slice(0, limit);
  }
}

export const transactionRepository = new TransactionRepository();
