import React from 'react';

export function Badge({ children, variant = 'neutral', pulse = false, className = '' }) {
  const variantStyles = {
    neutral: 'bg-surface-container-high text-on-surface-variant border-outline-variant',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    warning: 'bg-amber-50 text-amber-900 border-amber-200',
    error: 'bg-rose-50 text-rose-800 border-rose-200',
    active: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  };

  const dotColors = {
    neutral: 'bg-slate-400',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-rose-500',
    active: 'bg-emerald-500 animate-pulse',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border ${
        variantStyles[variant] || variantStyles.neutral
      } ${className}`}
    >
      {pulse && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant] || dotColors.neutral}`} />}
      {children}
    </span>
  );
}
