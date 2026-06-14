import { useEffect, useRef, useId, useState, useCallback, type ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  const handleClose = useCallback(() => {
    setVisible(false);
    setClosing(true);
    setTimeout(() => {
      dialogRef.current?.close();
      setClosing(false);
      prevFocusRef.current?.focus();
      onClose();
    }, 240);
  }, [onClose]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      prevFocusRef.current = document.activeElement as HTMLElement;
      setVisible(false);
      el.showModal();
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    }
    if (!open && el.open && !closing) {
      handleClose();
    }
  }, [open, closing, handleClose]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handler = () => handleClose();
    el.addEventListener('close', handler);
    return () => el.removeEventListener('close', handler);
  }, [handleClose]);

  if (!open && !closing) return null;

  const animateIn = visible && !closing;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
      className="fixed inset-0 z-50 m-0 flex h-full w-full items-center justify-center bg-transparent backdrop:bg-black/40"
      onClick={(e) => {
        if (e.target === dialogRef.current) handleClose();
      }}
    >
      <div
        className={`w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-3)] transition-all duration-200 ${animateIn ? 'opacity-100 scale-100' : 'opacity-0 scale-95'} ${className ?? ''}`}
      >
        {title && (
          <h2 id={titleId} className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h2>
        )}
        {description && (
          <p id={descId} className="mt-1 text-sm text-[var(--color-text-secondary)]">{description}</p>
        )}
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}
