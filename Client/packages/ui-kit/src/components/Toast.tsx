import { useEffect, useState } from 'react';

export interface ToastProps {
  id: string;
  message: string;
  level?: 'info' | 'success' | 'warning' | 'error';
  onDismiss: (id: string) => void;
  duration?: number;
}

const levelStyles: Record<string, string> = {
  info: 'border-[var(--color-border)]',
  success: 'border-[var(--color-success)] bg-[var(--color-success)]/5',
  warning: 'border-[var(--color-warn)] bg-[var(--color-warn)]/5',
  error: 'border-[var(--color-error)] bg-[var(--color-error)]/5',
};

const levelIcons: Record<string, string> = {
  info: 'i',
  success: '✓',
  warning: '!',
  error: '✕',
};

export function ToastItem({ id, message, level = 'info', onDismiss, duration = 4000 }: ToastProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration]);

  useEffect(() => {
    if (exiting) {
      const timer = setTimeout(() => onDismiss(id), 300);
      return () => clearTimeout(timer);
    }
  }, [exiting, id, onDismiss]);

  return (
    <div
      role="alert"
      className={`flex items-center gap-3 rounded-xl border bg-[var(--color-surface)] px-4 py-3 shadow-[var(--shadow-2)] transition-all duration-[var(--duration-base)] ${levelStyles[level]} ${
        exiting ? 'translate-x-4 opacity-0' : 'translate-x-0 opacity-100'
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white bg-[var(--color-accent)]">
        {levelIcons[level]}
      </span>
      <p className="text-sm text-[var(--color-text-primary)]">{message}</p>
      <button
        type="button"
        onClick={() => setExiting(true)}
        className="ml-auto shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
