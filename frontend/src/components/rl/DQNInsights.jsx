import React from 'react';
import { Card, CardHeader, CardContent } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';

export function DQNInsights({ metrics = null }) {
  const hasData = metrics !== null;

  return (
    <Card>
      <CardHeader
        title="DEEP Q-NETWORK (DQN)"
        badge={
          hasData ? (
            <Badge variant="active">Active Checkpoint</Badge>
          ) : (
            <Badge variant="warning">Awaiting Benchmark</Badge>
          )
        }
      />
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-600 leading-relaxed">
          DQN models discrete action-value functions using experience replay buffers and target networks to decouple temporal difference targets from parameter updates.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-xs">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
            <span className="text-[11px] text-slate-400 block uppercase">Mean Ep Reward</span>
            <span className="font-bold text-slate-800 text-sm">
              {hasData ? metrics.mean_reward?.toFixed(2) : 'Awaiting Run'}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
            <span className="text-[11px] text-slate-400 block uppercase">Sharpe Ratio</span>
            <span className="font-bold text-emerald-700 text-sm">
              {hasData ? metrics.sharpe_ratio?.toFixed(2) : 'Data unavailable'}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
            <span className="text-[11px] text-slate-400 block uppercase">Safety Breach Rate</span>
            <span className="font-bold text-slate-800 text-sm">
              {hasData ? `${(metrics.violation_rate * 100)?.toFixed(2)}%` : '0.00% (Guarded)'}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
            <span className="text-[11px] text-slate-400 block uppercase">Replay Buffer</span>
            <span className="font-bold text-slate-800 text-sm">50,000 Capacity</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
            <span className="text-[11px] text-slate-400 block uppercase">Target Tau (τ)</span>
            <span className="font-bold text-slate-800 text-sm">1.0 Hard Target</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
            <span className="text-[11px] text-slate-400 block uppercase">Exploration ε</span>
            <span className="font-bold text-slate-800 text-sm">0.05 Epsilon</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
