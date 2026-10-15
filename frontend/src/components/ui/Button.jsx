import React from 'react';

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
  const base = 'inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 rounded-md gap-1.5',
    md: 'text-sm px-4 py-2 rounded-lg gap-2',
    lg: 'text-base px-6 py-3 rounded-lg gap-2.5',
  };

  const variantStyles = {
    primary: 'bg-primary text-white hover:bg-secondary focus:ring-tertiary shadow-sm',
    secondary: 'bg-white text-on-surface border border-outline-variant hover:bg-surface-container hover:border-tertiary focus:ring-tertiary',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 focus:ring-rose-500',
    outline: 'bg-transparent text-primary border border-primary hover:bg-surface-container',
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {icon && <span className="material-symbols-outlined text-lg leading-none">{icon}</span>}
      {children}
    </button>
  );
}
