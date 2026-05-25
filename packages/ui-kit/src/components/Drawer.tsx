import { useEffect, useRef, type ReactNode } from 'react';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: 'left' | 'right';
  title?: string;
  children: ReactNode;
}

export function Drawer({ open, onClose, side = 'right', title, children }: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement as HTMLElement;
      // Focus the drawer on next tick
      requestAnimationFrame(() => {
        drawerRef.current?.focus();
      });

      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', handler);
      return () => {
        document.removeEventListener('keydown', handler);
        prevFocusRef.current?.focus();
      };
    }
  }, [open, onClose]);

  if (!open) return null;

  const sideStyles: Record<string, string> = {
    left: 'left-0',
    right: 'right-0',
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`fixed ${sideStyles[side]} top-0 z-50 h-full w-80 max-w-[90vw] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-3)] outline-none`}
      >
        <div className="mb-4 flex items-center justify-between">
          {title && (
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h2>
          )}
          <button
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="关闭"
          >
            <span aria-hidden="true" className="text-lg leading-none">&times;</span>
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
