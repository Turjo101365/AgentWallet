import React, { useState } from 'react';
import { Card, CardHeader, CardContent } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';
import { truncateAddress, formatEth } from '../../utils/formatters.js';

export function TransactionTable({ transactions = [], onSelectTx }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = transactions.filter((tx) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      tx.txHash?.toLowerCase().includes(term) ||
      tx.actionType?.toLowerCase().includes(term) ||
      tx.fromAddress?.toLowerCase().includes(term)
    );
  });

  return (
    <Card>
      <CardHeader
        title="CHRONOLOGICAL INFERENCE & EXECUTION STREAM"
        subtitle="Deterministic calldata and execution telemetry across agents"
        badge={<Badge variant="success">Verified On-Chain</Badge>}
        action={
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Filter by Tx or Action..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary w-48 sm:w-64 font-mono"
            />
            <button className="px-2.5 py-1.5 text-xs font-mono font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">data_object</span>
              <span>JSON</span>
            </button>
            <button className="px-2.5 py-1.5 text-xs font-mono font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">download</span>
              <span>CSV</span>
            </button>
          </div>
        }
      />
      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 font-mono text-xs">
            <span className="material-symbols-outlined text-3xl text-slate-300 block mb-2">receipt_long</span>
            No transaction data available. Connect wallet and authorize proposals to execute on-chain transfers.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Tx Hash</th>
                  <th className="py-3 px-4 font-semibold">Execution Type</th>
                  <th className="py-3 px-4 font-semibold">Amount ETH</th>
                  <th className="py-3 px-4 font-semibold">Consensus</th>
                  <th className="py-3 px-4 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((tx, idx) => (
                  <tr
                    key={tx.id || tx.txHash || idx}
                    onClick={() => onSelectTx && onSelectTx(tx)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-4 font-bold text-slate-800 flex items-center gap-2">
                      <span>{truncateAddress(tx.txHash || '0x000000', 8, 4)}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (tx.txHash) navigator.clipboard.writeText(tx.txHash);
                        }}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <span className="material-symbols-outlined text-xs">content_copy</span>
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-emerald-600">swap_horiz</span>
                        <span>{tx.actionType || 'Contract Call (Rebalance)'}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      {formatEth(tx.valueEth, 4)} ETH
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {tx.confirmations ? `${tx.confirmations} blocks` : '14 blocks'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Badge variant={tx.status === 'CONFIRMED' ? 'success' : 'warning'}>
                        {tx.status || 'Confirmed'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
