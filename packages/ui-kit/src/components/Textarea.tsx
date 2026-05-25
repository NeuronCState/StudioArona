import type { TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Textarea({ label, error, hint, className = '', id, ...props }: TextareaProps) {
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
      <textarea
        id={inputId}
        className={`w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 resize-y ${error ? 'border-[var(--color-error)]' : ''} ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-[var(--color-error)]">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-[var(--color-text-muted)]">{hint}</p>}
    </div>
  );
}
