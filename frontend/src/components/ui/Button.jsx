import React from 'react';
import { Link } from 'react-router-dom';

const BASE =
  'inline-flex items-center justify-center font-semibold rounded-full transition-all duration-150 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-tertiary disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100';
const SIZES = {
  sm: 'text-xs h-8 px-3.5 gap-1.5',
  md: 'text-sm h-10 px-5 gap-2',
  lg: 'text-base h-12 px-7 gap-2.5',
};
const VARIANTS = {
  primary: 'bg-ink text-white hover:bg-ink-3 shadow-sm',
  secondary: 'bg-white text-ink ring-1 ring-inset ring-slate-300 hover:ring-ink hover:bg-slate-50',
  danger: 'bg-blush text-blush-deep ring-1 ring-inset ring-blush-deep/20 hover:bg-[#f0cbbf]',
  outline: 'bg-transparent text-current ring-1 ring-inset ring-black/20 hover:bg-black/5',
  light: 'bg-white text-ink hover:bg-mint',
  ghost: 'bg-white/10 text-white hover:bg-white/20',
};


export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  className = '',
  icon = null,
  type = 'button',
}) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${BASE} ${SIZES[size]} ${VARIANTS[variant] || VARIANTS.primary} ${className}`}>
      {/* The icon is a font ligature (its text is the icon name); hide it so the accessible name is just the label. */}
      {icon && <span aria-hidden="true" className="material-symbols-outlined text-[18px] leading-none">{icon}</span>}
      {children}
    </button>
  );
}

/** A router link that looks like a Button. */
export function LinkButton({ to, state, children, variant = 'secondary', size = 'md', icon = null, className = '' }) {
  return (
    <Link to={to} state={state} className={`${BASE} ${SIZES[size]} ${VARIANTS[variant] || VARIANTS.secondary} ${className}`}>
      {icon && <span aria-hidden="true" className="material-symbols-outlined text-[18px] leading-none">{icon}</span>}
      {children}
    </Link>
  );
}
