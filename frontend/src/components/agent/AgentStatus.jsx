import React from 'react';
import { Card, CardHeader, CardContent } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';

export function AgentStatus({
  state = 'IDLE / MONITORING',
  activePolicy = 'AgentPolicy_v2.4_PPO',
  isPaused = false,
}) {
  return (
    <Card>
      <CardHeader
        title="AGENT ENGINE STATE"
        badge={
          <Badge variant={isPaused ? 'error' : state.includes('Approval') ? 'warning' : 'success'} pulse={!isPaused}>
            {isPaused ? 'PAUSED' : state}
          </Badge>
        }
      />
      <CardContent>
        <div className="font-semibold text-base text-on-surface">
          Mempool & Slippage Thresholds Active
        </div>
        <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
          Subscribed to basefee trends & liquidity depth dynamics.
        </p>

        <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-100 font-mono text-xs">
          <div>
            <div className="text-[11px] text-slate-400 uppercase">Evaluation Epoch</div>
            <div className="font-bold text-slate-800 mt-0.5">00:03:15</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400 uppercase">Simulation Delta</div>
            <div className="font-bold text-emerald-700 mt-0.5">≤ 0.04%</div>
          </div>
        </div>

        <div className="mt-3 text-[11px] font-mono text-slate-500 flex items-center justify-between">
          <span>Active Policy: {activePolicy}</span>
          <span className="material-symbols-outlined text-sm text-slate-400">tune</span>
        </div>
      </CardContent>
    </Card>
  );
}
