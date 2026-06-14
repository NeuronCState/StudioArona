import type { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 ${error ? 'border-[var(--color-error)]' : ''} ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-[var(--color-error)]">{error}</p>}
    </div>
  );
}
