import React from 'react';

export function Alert({ variant = 'info', title, children, className = '' }) {
  const styles = {
    info: 'bg-mint-soft text-mint-deep ring-mint-deep/15',
    warning: 'bg-butter-soft text-butter-deep ring-butter-deep/20',
    error: 'bg-blush-soft text-blush-deep ring-blush-deep/20',
  };

  const icons = {
    info: 'info',
    warning: 'warning',
    error: 'error',
  };

  return (
    <div className={`px-4 py-3.5 rounded-2xl ring-1 ring-inset flex items-start gap-3 text-[13px] leading-relaxed ${styles[variant] || styles.info} ${className}`}>
      <span aria-hidden="true" className="material-symbols-outlined text-[20px] shrink-0 mt-px">{icons[variant] || 'info'}</span>
      <div className="min-w-0">
        {title && <div className="font-bold mb-0.5">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}
