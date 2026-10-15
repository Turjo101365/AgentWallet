import React, { useState, useEffect } from 'react';
import { TransactionTable } from '../components/transactions/TransactionTable.jsx';
import { TransactionDetailsModal } from '../components/transactions/TransactionDetailsModal.jsx';
import { apiRequest } from '../services/apiClient.js';

export function TransactionHistory() {
  const [transactions, setTransactions] = useState([]);
  const [selectedTx, setSelectedTx] = useState(null);

  useEffect(() => {
    apiRequest('/transactions')
      .then(setTransactions)
      .catch((err) => console.warn('Could not load transactions:', err.message));
  }, []);

  return (
    <div className="space-y-6">
      <div className="pb-2 border-b border-slate-200/60">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-on-surface">
          Transaction History & Audit Trails
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Immutable off-chain audit logs and verified on-chain execution receipts.
        </p>
      </div>

      <TransactionTable
        transactions={transactions}
        onSelectTx={(tx) => setSelectedTx(tx)}
      />

      <TransactionDetailsModal
        isOpen={Boolean(selectedTx)}
        onClose={() => setSelectedTx(null)}
        transaction={selectedTx}
      />
    </div>
  );
}
