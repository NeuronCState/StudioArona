import { Circle, CircleAlert, CircleCheck, RefreshCw, Sparkles, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { motion as m } from '@/lib/motion';
import { Avatar } from '@javis/ui-kit';

interface AgentPanelHeaderProps {
  agentName: string;
  onClose: () => void;
  /** Hermes health probe result. `null` = still probing, `true` = ok,
   *  `false` = connection refused / not authenticated. */
  hermesReady: boolean | null;
  /** Re-probe Hermes. Surfaced as a "重试连接" button when hermesReady
   *  is `false` so the user doesn't have to close + reopen the panel. */
  onRetryConnection: () => void | Promise<void>;
}

export function AgentPanelHeader({
  agentName,
  onClose,
  hermesReady,
  onRetryConnection,
}: AgentPanelHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: m.duration.base / 1000, ease: m.easing.out }}
      className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar size="sm" alt={agentName} />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {agentName}
          </h2>
          <p className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
            <Sparkles size={10} aria-hidden="true" className="text-[var(--color-accent)]" />
            <span>专注模式</span>
            <HermesStatusChip
              ready={hermesReady}
              onRetry={onRetryConnection}
            />
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭专注面板"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </motion.div>
  );
}

/** Tiny inline status chip + optional retry button. Visible at all times
 *  so the user always knows whether the panel can talk to Hermes. */
function HermesStatusChip({
  ready,
  onRetry,
}: {
  ready: boolean | null;
  onRetry: () => void | Promise<void>;
}) {
  if (ready === null) {
    return (
      <span
        data-testid="hermes-status"
        data-ready="probing"
        className="ml-1 inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-px text-[9px] text-[var(--color-text-muted)]"
      >
        <Circle size={8} aria-hidden="true" className="animate-pulse" />
        <span>检查 Hermes…</span>
      </span>
    );
  }
  if (ready) {
    return (
      <span
        data-testid="hermes-status"
        data-ready="true"
        className="ml-1 inline-flex items-center gap-1 rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-1.5 py-px text-[9px] text-[var(--color-success)]"
      >
        <CircleCheck size={8} aria-hidden="true" />
        <span>Hermes 在线</span>
      </span>
    );
  }
  return (
    <span
      data-testid="hermes-status"
      data-ready="false"
      className="ml-1 inline-flex items-center gap-1 rounded-full border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-1.5 py-px text-[9px] text-[var(--color-error)]"
    >
      <CircleAlert size={8} aria-hidden="true" />
      <span>Hermes 未启动</span>
      <button
        type="button"
        onClick={onRetry}
        aria-label="重试连接 Hermes"
        data-testid="hermes-retry"
        className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded hover:bg-[var(--color-error)]/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-error)]"
      >
        <RefreshCw size={8} aria-hidden="true" />
      </button>
    </span>
  );
}
