import React from 'react';
import { Card, CardHeader, CardContent } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';

export function ApprovalPanel() {
  const stages = [
    { num: 1, title: 'State Observation', desc: '8-D normalized wallet & gas vector', status: 'done' },
    { num: 2, title: 'RL Inference', desc: 'PPO Actor-Critic / DQN Q-Network', status: 'done' },
    { num: 3, title: 'Action Generation', desc: 'Discrete action parameterization', status: 'done' },
    { num: 4, title: 'Deterministic Validation', desc: 'Spending limit & reserve floor check', status: 'done' },
    { num: 5, title: 'User Authorization', desc: 'Awaiting client approval / rejection', status: 'pending' },
    { num: 6, title: 'MetaMask Signing', desc: 'EIP-1193 client-side signing', status: 'pending' },
    { num: 7, title: 'Base Sepolia Broadcast', desc: 'Submitting tx to RPC endpoint', status: 'pending' },
    { num: 8, title: 'Receipt Verification', desc: '1+ Block confirmation', status: 'pending' },
    { num: 9, title: 'Audit Trail', desc: 'Persistent DB tracking record', status: 'pending' },
  ];

  const guardrails = [
    { label: 'Max Per-Tx Spend:', value: '0.01 ETH' },
    { label: 'Daily Spending Cap:', value: '0.05 ETH' },
    { label: 'Gas Price Reserve Floor:', value: '0.005 ETH' },
    { label: 'Target Network:', value: 'Base Sepolia (#84532)' },
  ];

  return (
    <div className="space-y-4">
      {/* 9-Stage Safety Architecture */}
      <Card>
        <CardHeader
          title="9-STAGE SAFETY PIPELINE"
          badge={<Badge variant="success">Deterministic</Badge>}
        />
        <CardContent className="space-y-2.5">
          {stages.slice(0, 5).map((s) => (
            <div key={s.num} className="flex items-start gap-3 font-mono text-xs">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                  s.status === 'done'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse'
                }`}
              >
                {s.num}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-800">{s.title}</div>
                <div className="text-[11px] text-slate-500 truncate">{s.desc}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Execution Stages 6 to 9 */}
      <Card>
        <CardHeader title="ON-CHAIN SETTLEMENT STAGES" />
        <CardContent className="space-y-2.5">
          {stages.slice(5).map((s) => (
            <div key={s.num} className="flex items-start gap-3 font-mono text-xs">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                  s.status === 'done'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-slate-100 text-slate-500 border border-slate-300'
                }`}
              >
                {s.num}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-800">{s.title}</div>
                <div className="text-[11px] text-slate-500 truncate">{s.desc}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Active Guardrails */}
      <Card>
        <CardHeader
          title="ACTIVE GUARDRAILS"
          badge={<Badge variant="neutral">STRICT</Badge>}
        />
        <CardContent className="space-y-2 font-mono text-xs">
          {guardrails.map((g, i) => (
            <div key={i} className="flex justify-between items-center py-1 border-b border-slate-100 last:border-0">
              <span className="text-slate-500">{g.label}</span>
              <span className="font-semibold text-slate-800">{g.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
