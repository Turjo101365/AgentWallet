import React from 'react';
import { Button } from '../ui/Button.jsx';
import { Badge } from '../ui/Badge.jsx';

export function AgentSelector({ activeAgent = 'PPO', onSelect, isSelecting = false }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-2xl text-primary">smart_toy</span>
        <div>
          <h4 className="text-sm font-bold text-on-surface">Active Reinforcement Learning Policy</h4>
          <p className="text-xs text-slate-500">Switch between policy-gradient (PPO) and value-based (DQN) architectures.</p>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
        <button
          onClick={() => onSelect('PPO')}
          disabled={isSelecting}
          className={`px-4 py-1.5 rounded-md text-xs font-mono font-bold transition-all ${
            activeAgent === 'PPO'
              ? 'bg-white text-emerald-800 shadow-sm border border-slate-200/80'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          PPO (Actor-Critic)
        </button>
        <button
          onClick={() => onSelect('DQN')}
          disabled={isSelecting}
          className={`px-4 py-1.5 rounded-md text-xs font-mono font-bold transition-all ${
            activeAgent === 'DQN'
              ? 'bg-white text-emerald-800 shadow-sm border border-slate-200/80'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          DQN (Q-Learning)
        </button>
      </div>
    </div>
  );
}
