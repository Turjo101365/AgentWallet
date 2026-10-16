import React from 'react';

// Pastel tones for bento cards. Each pairs a soft background with a deep ink of the same hue (AA contrast).
export const TONES = {
  white: 'bg-white text-on-surface',
  mint: 'bg-mint text-ink',
  lilac: 'bg-lilac text-ink',
  butter: 'bg-butter text-ink',
  sky: 'bg-sky text-ink',
  blush: 'bg-blush text-ink',
  ink: 'bg-ink text-white',
  canvas: 'bg-slate-50 text-on-surface',
};

export function Card({ children, className = '', highlight = false, onClick, tone = 'white', as: Tag = 'div' }) {
  return (
    <Tag
      onClick={onClick}
      className={`min-w-0 rounded-4xl transition-shadow duration-200 ${TONES[tone] || TONES.white} ${
        highlight ? 'ring-2 ring-ink shadow-floating' : 'shadow-card'
      } ${onClick ? 'cursor-pointer hover:shadow-floating' : ''} ${className}`}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, badge, action, eyebrow, className = '' }) {
  return (
    <div className={`px-5 pt-5 sm:px-7 sm:pt-6 flex items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow text-current opacity-60 mb-1.5">{eyebrow}</div>}
        <div className="flex items-center gap-2.5 flex-wrap">
          <h3 className="text-[22px] leading-tight text-current">{title}</h3>
          {badge}
        </div>
        {subtitle && <p className="text-[13px] text-current opacity-70 mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardContent({ children, className = '' }) {
  return <div className={`p-5 sm:p-7 ${className}`}>{children}</div>;
}

/** Page title in big display type. `eyebrow` is a small mono kicker above it. */
export function PageHeader({ eyebrow, title, children, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-2 animate-rise">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <div className="eyebrow text-slate-500 mb-3">{eyebrow}</div>}
        <h1 className="text-[44px] sm:text-[64px] xl:text-[76px] leading-[0.95] text-ink">{title}</h1>
        {children && <p className="text-[15px] sm:text-base text-slate-600 mt-4 leading-relaxed max-w-2xl">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
