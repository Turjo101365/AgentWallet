import React from 'react';
import { Card, CardHeader, CardContent } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';

export function ComparisonChart() {
  const benchmarks = [
    { metric: 'Mean Cumulative Reward', ppo: '4.12', dqn: '3.78', winner: 'PPO' },
    { metric: 'Sharpe Ratio', ppo: '1.84', dqn: '1.55', winner: 'PPO' },
    { metric: 'Safety Breach Rate', ppo: '0.001%', dqn: '0.003%', winner: 'PPO' },
    { metric: 'Inference Latency', ppo: '4.2ms', dqn: '1.8ms', winner: 'DQN' },
    { metric: 'Sample Efficiency', ppo: 'Moderate (On-policy)', dqn: 'High (Replay)', winner: 'DQN' },
    { metric: 'Action Space', ppo: 'Discrete 4-D', dqn: 'Discrete 4-D', winner: 'Tie' },
  ];

  return (
    <Card>
      <CardHeader
        title="POLICY ARCHITECTURE BENCHMARK MATRIX"
        subtitle="Controlled 500-step simulation rollouts across identical gas volatility environments"
        badge={<Badge variant="neutral">EVALUATION HARNESS</Badge>}
      />
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase text-[11px]">
                <th className="pb-3 font-semibold">Evaluation Metric</th>
                <th className="pb-3 font-semibold">PPO (Actor-Critic)</th>
                <th className="pb-3 font-semibold">DQN (Q-Learning)</th>
                <th className="pb-3 font-semibold text-right">Advantage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {benchmarks.map((b, i) => (
                <tr key={i} className="hover:bg-slate-50/60">
                  <td className="py-3 font-sans text-xs font-semibold text-slate-800">{b.metric}</td>
                  <td className="py-3 font-bold text-slate-700">{b.ppo}</td>
                  <td className="py-3 font-bold text-slate-700">{b.dqn}</td>
                  <td className="py-3 text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        b.winner === 'PPO'
                          ? 'bg-emerald-100 text-emerald-800'
                          : b.winner === 'DQN'
                          ? 'bg-teal-100 text-teal-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {b.winner}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
