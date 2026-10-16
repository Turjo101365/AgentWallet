import React from 'react';
import { NavLink } from 'react-router-dom';

export const NAV = [
  { to: '/', label: 'Overview', icon: 'grid_view' },
  { to: '/agent', label: 'AI agent', icon: 'smart_toy' },
  { to: '/proposals', label: 'Approvals', icon: 'fact_check' },
  { to: '/automation', label: 'Automation', icon: 'event_repeat' },
  { to: '/portfolio', label: 'Portfolio', icon: 'pie_chart' },
  { to: '/treasury', label: 'Treasury', icon: 'account_balance_wallet' },
  { to: '/controls', label: 'Risk controls', icon: 'shield_lock' },
  { to: '/transactions', label: 'Transactions', icon: 'receipt_long' },
  { to: '/audit', label: 'Audit log', icon: 'history_edu' },
  { to: '/rl', label: 'RL timing', icon: 'insights' },
  { to: '/security', label: 'Security', icon: 'settings' },
];

/**
 * Primary navigation as a pill rail. Inactive items are icon buttons with a tooltip; the active item
 * expands to show its label. Below `lg` every item shows its label and the rail scrolls sideways.
 */
export function PrimaryNav({ className = '' }) {
  return (
    <nav aria-label="Primary" className={`flex items-center gap-1 overflow-x-auto no-scrollbar ${className}`}>
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          aria-label={item.label}
          title={item.label}
          className={({ isActive }) =>
            `group relative shrink-0 flex items-center gap-2 h-10 rounded-full text-[13px] font-semibold transition-all duration-200 ${
              isActive ? 'bg-white text-ink pl-3 pr-4' : 'text-white/70 hover:text-white hover:bg-white/10 px-3 lg:w-10 lg:px-0 lg:justify-center'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span className={isActive ? '' : 'lg:sr-only'}>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
