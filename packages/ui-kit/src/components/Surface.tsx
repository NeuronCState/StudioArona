import type { HTMLAttributes, ReactNode } from 'react';

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  elevated?: boolean;
}

const paddingStyles: Record<string, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function Surface({
  children,
  padding = 'md',
  elevated = false,
  className = '',
  ...props
}: SurfaceProps) {
  return (
    <div
      className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] ${elevated ? 'shadow-[var(--shadow-2)]' : 'shadow-[var(--shadow-1)]'} ${paddingStyles[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
