import type { ReactNode } from 'react';

export interface TagProps {
  children: ReactNode;
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'error';
  onRemove?: () => void;
  size?: 'sm' | 'md';
}

const variantStyles: Record<string, string> = {
  default: 'bg-[var(--color-bg)] text-[var(--color-text-secondary)]',
  accent: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
  success: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
  warning: 'bg-[var(--color-warn)]/10 text-[var(--color-warn)]',
  error: 'bg-[var(--color-error)]/10 text-[var(--color-error)]',
};

const sizeStyles: Record<string, string> = {
  sm: 'px-1.5 py-0 text-xs',
  md: 'px-2.5 py-0.5 text-xs',
};

export function Tag({ children, variant = 'default', onRemove, size = 'md' }: TagProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-medium ${variantStyles[variant]} ${sizeStyles[size]}`}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-sm p-0.5 hover:bg-black/10 focus-visible:outline-none"
          aria-label="Remove"
        >
          ×
        </button>
      )}
    </span>
  );
}
