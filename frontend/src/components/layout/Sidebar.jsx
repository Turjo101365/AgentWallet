import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../../app/providers.jsx';

export const NAV = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/agent', label: 'AI Assistant', icon: 'auto_awesome' },
  { to: '/proposals', label: 'Payments', icon: 'payments' },
  { to: '/automation', label: 'Automations', icon: 'event_repeat' },
  { to: '/controls', label: 'Security', icon: 'shield_lock' },
  { to: '/security', label: 'Settings', icon: 'settings' },
];

/**
 * Primary navigation as a pill rail. Inactive items are icon buttons with a tooltip; the active item
 * expands to show its label. Below `lg` every item shows its label and the rail scrolls sideways.
 */
export function PrimaryNav({ className = '' }) {
  const { judgeSite } = useApp();
  // Public judge site: no RL service is deployed; historical evidence is its own section.
  const items = judgeSite ? [...NAV, { to: '/evidence', label: 'Evidence', icon: 'verified' }] : NAV;
  return (
    <nav aria-label="Primary" className={`flex min-w-0 items-center gap-1 overflow-x-auto ${className}`}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          aria-label={item.label}
          title={item.label}
          className={({ isActive }) =>
            `group relative shrink-0 flex items-center gap-2 h-10 rounded-full text-[13px] font-semibold transition-all duration-200 ${
              isActive ? 'bg-white text-ink pl-3 pr-4' : 'text-white/80 hover:text-white hover:bg-white/10 px-3'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
