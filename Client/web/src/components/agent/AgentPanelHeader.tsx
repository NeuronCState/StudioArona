import { X, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { motion as m } from '@/lib/motion';
import { Avatar } from '@javis/ui-kit';

interface AgentPanelHeaderProps {
  agentName: string;
  onClose: () => void;
}

export function AgentPanelHeader({ agentName, onClose }: AgentPanelHeaderProps) {
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
