import React from 'react';
import { Card, CardHeader, CardContent } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';
import { formatAmount } from '../../utils/formatters.js';

/** Per-asset balance and the contract's live limits, read on-chain by the backend. */
export function BalancesCard({ state }) {
  if (!state) return null;
  return (
    <Card>
      <CardHeader
        title="Available balance"
        subtitle={`Read on-chain at block ${state.blockNumber}`}
        badge={state.paused ? <Badge variant="error">Contract paused</Badge> : <Badge variant="success">Contract active</Badge>}
      />
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-slate-400 uppercase text-[11px] border-b border-slate-100">
                <th className="py-2">Asset</th>
                <th className="py-2 text-right">Balance</th>
                <th className="py-2 text-right">Per-tx cap</th>
                <th className="py-2 text-right">Daily cap</th>
                <th className="py-2 text-right">Spent today</th>
                <th className="py-2 text-right">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {state.tokens.map((t) => (
                <tr key={t.address} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 font-semibold text-slate-800">
                    {t.symbol} {t.testOnly && <span className="text-[10px] text-amber-700">(test token)</span>}
                    {!t.enabled && <span className="text-[10px] text-rose-700 ml-1">disabled</span>}
                  </td>
                  <td className="py-2 text-right">{formatAmount(t.formatted.balance)}</td>
                  <td className="py-2 text-right">{formatAmount(t.formatted.perTxLimit)}</td>
                  <td className="py-2 text-right">{formatAmount(t.formatted.dailyLimit)}</td>
                  <td className="py-2 text-right">{formatAmount(t.formatted.spentToday)}</td>
                  <td className="py-2 text-right">{formatAmount(t.formatted.remainingToday)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">Daily caps reset at 00:00 UTC (contract calendar day {state.day}).</p>
      </CardContent>
    </Card>
  );
}
