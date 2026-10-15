import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../../app/providers.jsx';

const NAV = [
  { to: '/', label: 'Overview', icon: 'grid_view' },
  { to: '/agent', label: 'AI agent', icon: 'smart_toy' },
  { to: '/proposals', label: 'Proposals', icon: 'fact_check' },
  { to: '/automation', label: 'Automation', icon: 'event_repeat' },
  { to: '/portfolio', label: 'Portfolio', icon: 'pie_chart' },
  { to: '/treasury', label: 'Treasury', icon: 'account_balance_wallet' },
  { to: '/controls', label: 'Risk controls', icon: 'shield_lock' },
  { to: '/transactions', label: 'Transactions', icon: 'receipt_long' },
  { to: '/audit', label: 'Audit log', icon: 'history_edu' },
  { to: '/rl', label: 'RL timing', icon: 'insights' },
  { to: '/security', label: 'Security', icon: 'settings' },
];

export function Sidebar() {
  const { config } = useApp();
  return (
    <aside className="w-60 bg-white border-r border-slate-200/80 hidden md:flex flex-col justify-between h-screen sticky top-0 shrink-0">
      <div>
        <div className="p-5 flex items-center gap-2.5 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-lg">account_balance_wallet</span>
          </div>
          <span className="font-bold tracking-tight text-base text-on-surface">AgentWallet</span>
        </div>
        <nav className="p-3 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:text-on-surface hover:bg-slate-50'
                }`
              }
            >
              <span className="material-symbols-outlined text-xl">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="p-3 m-3 bg-surface-container-low rounded-xl border border-slate-200/60 text-[11px] font-mono text-slate-600 space-y-1">
        <div className="flex justify-between"><span>Network</span><span className="font-semibold">{config?.networkName || '—'}</span></div>
        <div className="flex justify-between"><span>Chain ID</span><span className="font-semibold">{config?.chainId ?? '—'}</span></div>
        <div className="flex justify-between">
          <span>Backend chain</span>
          <span className={config?.chainReady ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>{config ? (config.chainReady ? 'verified' : 'unavailable') : '—'}</span>
        </div>
      </div>
    </aside>
  );
}
