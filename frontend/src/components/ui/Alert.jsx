import React from 'react';

export function Alert({ variant = 'info', title, children, className = '' }) {
  const styles = {
    info: 'bg-emerald-50/60 border-emerald-200 text-emerald-900',
    warning: 'bg-amber-50/60 border-amber-200 text-amber-900',
    error: 'bg-rose-50/60 border-rose-200 text-rose-900',
  };

  const icons = {
    info: 'info',
    warning: 'warning',
    error: 'error',
  };

  return (
    <div className={`p-3.5 rounded-lg border flex items-start gap-3 text-xs leading-relaxed ${styles[variant] || styles.info} ${className}`}>
      <span className="material-symbols-outlined text-lg shrink-0 mt-0.5">{icons[variant] || 'info'}</span>
      <div>
        {title && <div className="font-semibold mb-0.5">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}
