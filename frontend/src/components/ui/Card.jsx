import React from 'react';

export function Card({
  children,
  className = '',
  highlight = false,
  onClick,
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border transition-all duration-200 ${
        highlight
          ? 'border-emerald-300 ring-2 ring-emerald-100 shadow-md'
          : 'border-slate-200/80 hover:border-slate-300 shadow-card'
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, badge, action, className = '' }) {
  return (
    <div className={`p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between ${className}`}>
      <div>
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold tracking-tight text-on-surface">{title}</h3>
          {badge}
        </div>
        {subtitle && <p className="text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function CardContent({ children, className = '' }) {
  return <div className={`p-4 sm:p-5 ${className}`}>{children}</div>;
}
