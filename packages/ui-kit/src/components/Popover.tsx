import { useState, useRef, useEffect, type ReactNode } from 'react';

export interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Popover({
  trigger,
  children,
  side = 'bottom',
  align = 'center',
  open: controlledOpen,
  onOpenChange,
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const sideStyles: Record<string, string> = {
    top: 'bottom-full mb-1.5',
    bottom: 'top-full mt-1.5',
    left: 'right-full mr-1.5',
    right: 'left-full ml-1.5',
  };

  const alignStyles: Record<string, string> = {
    start: 'left-0',
    center: 'left-1/2 -translate-x-1/2',
    end: 'right-0',
  };

  return (
    <div ref={ref} className="relative inline-block">
      <span onClick={() => setOpen(!open)} className="cursor-pointer">
        {trigger}
      </span>
      {open && (
        <div
          className={`absolute z-50 min-w-[180px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-2)] ${sideStyles[side]} ${alignStyles[align]}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
