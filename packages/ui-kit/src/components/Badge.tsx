import type { ReactNode } from 'react';

export interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'accent';
  children: ReactNode;
}

const variantStyles: Record<string, string> = {
  default: 'bg-[var(--color-bg)] text-[var(--color-text-secondary)]',
  success: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
  warning: 'bg-[var(--color-warn)]/10 text-[var(--color-warn)]',
  error: 'bg-[var(--color-error)]/10 text-[var(--color-error)]',
  accent: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
};

export function Badge({ variant = 'default', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium ${variantStyles[variant]}`}
    >
      {children}
    </span>
  );
}
