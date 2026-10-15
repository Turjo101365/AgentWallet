import React from 'react';
import { NavLink } from 'react-router-dom';

export function Sidebar({ networkState = {} }) {
  const navItems = [
    { to: '/', label: 'Overview', icon: 'grid_view' },
    { to: '/wallet', label: 'Wallet', icon: 'account_balance_wallet' },
    { to: '/agent', label: 'Agent Activity', icon: 'smart_toy', badge: true },
    { to: '/transactions', label: 'Transactions', icon: 'receipt_long' },
    { to: '/contracts', label: 'Smart Contracts', icon: 'verified' },
    { to: '/rl-insights', label: 'RL Insights', icon: 'insights' },
    { to: '/settings', label: 'Settings', icon: 'settings' },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200/80 flex flex-col justify-between h-screen sticky top-0 shrink-0">
      <div>
        {/* Brand Header */}
        <div className="p-5 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm">
              <span className="material-symbols-outlined text-lg">account_balance_wallet</span>
            </div>
            <span className="font-bold tracking-tight text-base text-on-surface">AgentWallet</span>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
            v1.2
          </span>
        </div>

        {/* Navigation */}
        <div className="p-3">
          <div className="text-[11px] font-bold text-slate-400 tracking-wider uppercase px-3 py-2">
            Core Workbench
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-slate-600 hover:text-on-surface hover:bg-slate-50'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <span className={`material-symbols-outlined text-xl ${isActive ? 'text-white' : 'text-slate-400'}`}>
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-white' : 'bg-primary animate-pulse'}`} />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* Network State Footer in Sidebar */}
      <div className="p-3 m-3 bg-surface-container-low rounded-xl border border-slate-200/60 text-xs">
        <div className="flex items-center justify-between font-mono text-[11px] font-bold text-slate-700 pb-2 border-b border-slate-200/60 mb-2">
          <span>NETWORK STATE</span>
          <span className="flex items-center gap-1 text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {networkState.name || 'Base Sepolia'}
          </span>
        </div>
        <div className="space-y-1.5 text-slate-500 font-mono text-[11px]">
          <div className="flex justify-between">
            <span>Chain ID</span>
            <span className="text-on-surface font-semibold">84532</span>
          </div>
          <div className="flex justify-between">
            <span>Network</span>
            <span className="text-on-surface font-semibold">Base Sepolia</span>
          </div>
          <div className="flex justify-between">
            <span>Status</span>
            <span className="text-emerald-700 font-semibold">Active</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
