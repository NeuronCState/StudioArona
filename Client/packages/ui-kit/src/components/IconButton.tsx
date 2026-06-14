import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const sizeStyles: Record<string, string> = {
  sm: 'h-7 w-7 rounded-md',
  md: 'h-9 w-9 rounded-lg',
  lg: 'h-11 w-11 rounded-xl',
};

export function IconButton({
  label,
  size = 'md',
  className = '',
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`inline-flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 disabled:opacity-40 ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
