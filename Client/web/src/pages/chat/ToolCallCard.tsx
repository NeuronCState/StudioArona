import { useState } from 'react';
import { Wrench, Loader2, ChevronDown, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ToolCallRecord } from '@/hooks/useChatStream';

interface ToolCallCardProps {
  toolCall: ToolCallRecord;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = toolCall.status === 'loading';
  const isSuccess = toolCall.status === 'ok';
  const isError = toolCall.status === 'error';
  const toolName = toolCall.tool;

  return (
    <motion.div
      layout
      className={`rounded-xl border text-sm ${
        isError
          ? 'border-[var(--color-error)] bg-[var(--color-error)]/5'
          : 'border-[var(--color-border)] bg-[var(--color-bg)]'
      }`}
    >
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={expanded}
        aria-label={`${toolName} — ${isRunning ? '运行中' : isSuccess ? '成功' : '失败'}`}
      >
        {isRunning ? (
          <Loader2 size={14} className="animate-spin text-[var(--color-accent)] shrink-0" />
        ) : isSuccess ? (
          <CheckCircle size={14} className="text-[var(--color-success)] shrink-0" />
        ) : (
          <XCircle size={14} className="text-[var(--color-error)] shrink-0" />
        )}
        <Wrench size={14} className="text-[var(--color-text-muted)] shrink-0" />
        <span className="font-medium text-[var(--color-text-primary)]">{toolName}</span>
        {toolCall.result !== undefined && typeof toolCall.result === 'string' && (
          <span className="truncate text-[var(--color-text-muted)]">
            — {toolCall.result}
          </span>
        )}
        {toolCall.latencyMs !== undefined && (
          <span className="ml-auto shrink-0 text-xs text-[var(--color-text-muted)]">
            {toolCall.latencyMs < 1000
              ? `${toolCall.latencyMs}ms`
              : `${(toolCall.latencyMs / 1000).toFixed(1)}s`}
          </span>
        )}
        <span className="shrink-0 text-[var(--color-text-muted)]">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-[var(--color-border)] px-3 py-2">
              {toolCall.args != null && typeof toolCall.args === "object" && (
                <div>
                  <p className="mb-1 text-xs font-medium text-[var(--color-text-secondary)]">Input</p>
                  <pre className="overflow-x-auto rounded-md bg-[var(--color-surface)] p-2 text-xs text-[var(--color-text-primary)]">
                    {JSON.stringify(toolCall.args, null, 2)}
                  </pre>
                </div>
              )}
              {toolCall.result !== undefined && (
                <div>
                  <p className="mb-1 text-xs font-medium text-[var(--color-text-secondary)]">Result</p>
                  <pre className="overflow-x-auto rounded-md bg-[var(--color-surface)] p-2 text-xs text-[var(--color-success)]">
                    {typeof toolCall.result === 'string'
                      ? toolCall.result
                      : JSON.stringify(toolCall.result, null, 2)}
                  </pre>
                </div>
              )}
              {toolCall.error && (
                <div>
                  <p className="mb-1 text-xs font-medium text-[var(--color-error)]">Error</p>
                  <pre className="overflow-x-auto rounded-md bg-[var(--color-error)]/5 p-2 text-xs text-[var(--color-error)]">
                    {toolCall.error}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
