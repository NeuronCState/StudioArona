import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import { motion as m } from "@/lib/motion";

interface AgentErrorToastProps {
  /** Latest human-readable error from the chat hook, or null when
   *  there's nothing to show. Setting it to a new value resets the
   *  auto-dismiss timer. */
  message: string | null;
  /** Called when the user clicks the close button OR the auto-dismiss
   *  timer fires. The hook uses this to clear `lastError`. */
  onDismiss: () => void;
  /** How long the toast stays visible before auto-dismissing. */
  durationMs?: number;
}

/**
 * AgentErrorToast — non-blocking banner pinned to the top of the message
 * area. Surfaces the latest `useAgentChat().lastError` so connection /
 * streaming failures are visible even if the user has scrolled past the
 * failed assistant bubble. The toast itself is purely presentational —
 * the hook owns the `lastError` state and decides when to set/clear it.
 */
export function AgentErrorToast({
  message,
  onDismiss,
  durationMs = 6000,
}: AgentErrorToastProps) {
  // Re-key on every new message so the auto-dismiss timer restarts.
  const [timerKey, setTimerKey] = useState(0);
  useEffect(() => {
    if (message) setTimerKey((k) => k + 1);
  }, [message]);

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(t);
  }, [message, durationMs, timerKey, onDismiss]);

  return (
    <div
      className="pointer-events-none absolute inset-x-3 top-3 z-20 flex justify-center"
      aria-live="polite"
    >
      <AnimatePresence>
        {message && (
          <motion.div
            key={timerKey}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{
              duration: m.duration.fast / 1000,
              ease: m.easing.out,
            }}
            role="alert"
            data-testid="agent-error-toast"
            className="pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-lg border border-[var(--color-error)]/50 bg-[var(--color-error)]/10 px-3 py-2 shadow-[var(--shadow-2)] backdrop-blur"
          >
            <AlertCircle
              size={14}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[var(--color-error)]"
            />
            <p
              className="flex-1 text-xs leading-relaxed text-[var(--color-text-primary)]"
              data-testid="agent-error-toast-message"
            >
              {message}
            </p>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="关闭错误提示"
              className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-error)] rounded"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
