import React from 'react';

export function Badge({ children, variant = 'neutral', pulse = false, className = '' }) {
  const variantStyles = {
    neutral: 'bg-slate-100 text-slate-700',
    success: 'bg-mint text-mint-deep',
    warning: 'bg-butter text-butter-deep',
    error: 'bg-blush text-blush-deep',
    active: 'bg-mint text-mint-deep',
    info: 'bg-sky text-sky-deep',
    dark: 'bg-white/10 text-white',
  };

  const dotColors = {
    neutral: 'bg-slate-500',
    success: 'bg-mint-deep',
    warning: 'bg-butter-deep',
    error: 'bg-blush-deep',
    active: 'bg-mint-deep',
    info: 'bg-sky-deep',
    dark: 'bg-white',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-[11px] font-mono font-semibold whitespace-nowrap ${variantStyles[variant] || variantStyles.neutral} ${className}`}>
      {pulse && (
        <span aria-hidden="true" className="relative inline-flex w-1.5 h-1.5">
          <span className={`absolute inset-0 rounded-full animate-ping2 ${dotColors[variant] || dotColors.neutral}`} />
          <span className={`relative w-1.5 h-1.5 rounded-full ${dotColors[variant] || dotColors.neutral}`} />
        </span>
      )}
      {children}
    </span>
  );
}
