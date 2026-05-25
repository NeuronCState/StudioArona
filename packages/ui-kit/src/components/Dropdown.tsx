import type { ReactNode } from 'react';

export interface DropdownItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

export interface DropdownProps {
  items: DropdownItem[];
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'end';
}

export function Dropdown({ items, children, side = 'bottom', align = 'start' }: DropdownProps) {
  const sideStyles: Record<string, string> = {
    top: 'bottom-full mb-1.5',
    bottom: 'top-full mt-1.5',
  };

  const alignStyles: Record<string, string> = {
    start: 'left-0',
    end: 'right-0',
  };

  return (
    <div className="relative inline-block group">
      <span className="cursor-pointer">{children}</span>
      <div
        className={`absolute z-50 min-w-[160px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-2)] opacity-0 invisible group-hover:visible group-hover:opacity-100 transition-all duration-[var(--duration-fast)] ${sideStyles[side]} ${alignStyles[align]}`}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            disabled={item.disabled}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              item.danger
                ? 'text-[var(--color-error)] hover:bg-[var(--color-error)]/10'
                : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg)]'
            } disabled:opacity-40`}
          >
            {item.icon && <span className="h-4 w-4 shrink-0">{item.icon}</span>}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
