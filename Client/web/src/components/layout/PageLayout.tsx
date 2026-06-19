import type { ReactNode } from "react";

interface PageLayoutProps {
  subtitle?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function PageLayout({
  subtitle,
  title,
  description,
  action,
  children,
}: PageLayoutProps) {
  return (
    <div className="studio-page mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          {subtitle && (
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">
              {subtitle}
            </p>
          )}
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--color-text-primary)]">
            {title}
          </h2>
          {description && (
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}
