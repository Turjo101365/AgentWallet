import React, { useState } from 'react';
import { Card, CardHeader, CardContent } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { formatEth } from '../../utils/formatters.js';

export function SpendingLimitConfig({
  perTxLimit = 0.01,
  dailyLimit = 0.05,
  dailySpent = 0.0,
  onUpdateLimits,
  isUpdating = false,
}) {
  const [newPerTx, setNewPerTx] = useState(perTxLimit.toString());
  const [newDaily, setNewDaily] = useState(dailyLimit.toString());

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onUpdateLimits) {
      onUpdateLimits(parseFloat(newPerTx), parseFloat(newDaily));
    }
  };

  const percentSpent = Math.min(100, (dailySpent / max(0.001, dailyLimit)) * 100);

  function max(a, b) {
    return a > b ? a : b;
  }

  return (
    <Card>
      <CardHeader
        title="SPENDING LIMITS & ALLOWANCES"
        subtitle="Enforced directly within contract bytecode"
      />
      <CardContent className="space-y-4">
        {/* Daily Allowance Progress Track */}
        <div>
          <div className="flex justify-between items-center text-xs font-mono mb-1.5">
            <span className="text-slate-500">Daily Spending Cap Utilization:</span>
            <span className="font-bold text-slate-800">
              {formatEth(dailySpent, 4)} / {formatEth(dailyLimit, 2)} ETH ({percentSpent.toFixed(1)}%)
            </span>
          </div>
          <div className="h-2.5 w-full bg-emerald-100 rounded-full overflow-hidden">
            <div
              style={{ width: `${percentSpent}%` }}
              className="h-full bg-primary transition-all duration-300"
            />
          </div>
        </div>

        {/* Update Form */}
        <form onSubmit={handleSubmit} className="pt-3 border-t border-slate-100 space-y-3 font-mono text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-slate-500 block mb-1">Per-Tx Limit (ETH)</label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={newPerTx}
                onChange={(e) => setNewPerTx(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="text-slate-500 block mb-1">Daily Cap (ETH)</label>
              <input
                type="number"
                step="0.005"
                min="0.005"
                value={newDaily}
                onChange={(e) => setNewDaily(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={isUpdating}
              icon="tune"
            >
              {isUpdating ? 'Updating...' : 'Update Limits via MetaMask'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
