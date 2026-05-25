import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

export interface CardEmptyProps {
  /** Guidance text shown below the icon */
  hint?: string;
  /** CTA button label */
  cta?: string;
  /** CTA click handler */
  onCta?: () => void;
  /** Custom icon override (default: Inbox) */
  icon?: ReactNode;
  /** Optional additional class name */
  className?: string;
}

export function CardEmpty({
  hint = '暂无数据',
  cta,
  onCta,
  icon,
  className = '',
}: CardEmptyProps) {
  return (
    <div
      className={`mx-auto flex max-w-md flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/50 px-6 py-10 text-center shadow-sm ${className}`}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-bg)]">
        {icon ?? <Inbox size={28} className="text-[var(--color-text-muted)]" />}
      </div>
      <p className="text-sm text-[var(--color-text-secondary)]">{hint}</p>
      {cta && onCta ? (
        <button
          onClick={onCta}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:opacity-90 active:opacity-80"
        >
          {cta}
        </button>
      ) : null}
    </div>
  );
}
