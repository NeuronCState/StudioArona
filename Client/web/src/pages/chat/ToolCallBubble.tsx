import { useEffect, useRef, useState } from 'react';
import { Wrench, Loader2, CheckCircle, XCircle, Terminal, ChevronDown, ChevronRight, Copy, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ToolCallBubbleProps {
  id: string;
  tool: string;
  args: unknown;
  status: 'loading' | 'success' | 'error';
  result?: unknown;
  error?: string;
  latencyMs?: number;
  variant?: 'default' | 'vm-console';
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatArgs(args: unknown): string {
  if (typeof args === 'string') return args;
  if (args && typeof args === 'object' && Object.keys(args as object).length > 0) {
    return JSON.stringify(args, null, 2);
  }
  return '';
}

function formatResult(result: unknown): string {
  if (typeof result === 'string') return result;
  return JSON.stringify(result, null, 2);
}

export function ToolCallBubble({
  id: _id,
  tool,
  args,
  status,
  result,
  error,
  latencyMs,
  variant = 'default',
}: ToolCallBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef<number>(Date.now());

  // ── Loading timer ──
  useEffect(() => {
    if (status !== 'loading') return;
    startRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startRef.current);
    }, 100);
    return () => clearInterval(interval);
  }, [status]);

  const displayLatency = latencyMs ?? (status !== 'loading' ? elapsedMs : elapsedMs);

  // ── VM Console variant ──
  if (variant === 'vm-console') {
    const consoleLines = formatResult(result).split('\n').slice(0, 50);
    const truncated = Array.isArray(result) ? false : formatResult(result).split('\n').length > 50;

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-[var(--color-border)] bg-[#0d1117] text-[#c9d1d9] font-mono text-xs overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#30363d] bg-[#161b22]">
          <Terminal size={14} className="text-[#58a6ff] shrink-0" />
          <span className="text-[#8b949e]">{String(tool)}</span>
          {status === 'loading' && (
            <Loader2 size={12} className="animate-spin text-[#58a6ff] ml-auto" />
          )}
          {status === 'success' && (
            <CheckCircle size={12} className="text-[#3fb950] ml-auto" />
          )}
          {status === 'error' && (
            <XCircle size={12} className="text-[#f85149] ml-auto" />
          )}
        </div>

        {/* Console body */}
        <div className="p-3 max-h-80 overflow-y-auto whitespace-pre-wrap break-all leading-relaxed">
          {consoleLines.join('\n')}
          {truncated && (
            <div className="mt-2 pt-2 border-t border-[#30363d] text-[#8b949e] italic">
              ... output truncated (50 lines) ...
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-3 py-2 border-t border-[#30363d] bg-[#161b22]">
          <button
            onClick={() => navigator.clipboard.writeText(formatResult(result))}
            className="flex items-center gap-1 text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
            aria-label="Copy console output"
          >
            <Copy size={12} />
            <span className="text-[10px]">复制</span>
          </button>
          <button
            className="flex items-center gap-1 text-[#8b949e] hover:text-[#c9d1d9] transition-colors ml-auto"
            aria-label="View VM console"
          >
            <ExternalLink size={12} />
            <span className="text-[10px]">控制台</span>
          </button>
        </div>
      </motion.div>
    );
  }

  // ── Default variant ──
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border text-sm ${
        status === 'error'
          ? 'border-[var(--color-error)] bg-[var(--color-error)]/5'
          : 'border-[var(--color-border)] bg-[var(--color-bg)]'
      }`}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={expanded}
        aria-label={`${String(tool)} — ${status === 'loading' ? '调用中' : status === 'success' ? '成功' : '失败'}`}
      >
        {/* Status icon */}
        {status === 'loading' ? (
          <Loader2 size={14} className="animate-spin text-[var(--color-accent)] shrink-0" />
        ) : status === 'success' ? (
          <CheckCircle size={14} className="text-[var(--color-success)] shrink-0" />
        ) : (
          <XCircle size={14} className="text-[var(--color-error)] shrink-0" />
        )}

        <Wrench size={14} className="text-[var(--color-text-muted)] shrink-0" />

        <span className="font-medium text-[var(--color-text-primary)]">{String(tool)}</span>

        {/* Args summary (single line) */}
        {args != null && typeof args === "object" && Object.keys(args as object).length > 0 && (
          <span className="truncate text-[var(--color-text-muted)] max-w-[200px]">
            &mdash; {JSON.stringify(args)}
          </span>
        )}

        {/* Latency badge */}
        {(displayLatency > 0 || status === 'loading') && (
          <span className={`ml-2 shrink-0 text-[11px] px-1.5 py-0.5 rounded-full ${
            status === 'loading'
              ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
              : 'bg-[var(--color-surface)] text-[var(--color-text-muted)]'
          }`}>
            {status === 'loading' ? `${formatLatency(elapsedMs)}` : formatLatency(displayLatency)}
          </span>
        )}

        <span className="ml-auto shrink-0 text-[var(--color-text-muted)]">
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
              {/* Args detail */}
              {args != null && typeof args === "object" && Object.keys(args as object).length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-[var(--color-text-secondary)]">
                    Arguments
                  </p>
                  <pre className="overflow-x-auto rounded-md bg-[var(--color-surface)] p-2 text-xs text-[var(--color-text-primary)]">
                    {formatArgs(args)}
                  </pre>
                </div>
              )}

              {/* Success result */}
              {status === 'success' && result !== undefined && (
                <div>
                  <p className="mb-1 text-xs font-medium text-[var(--color-text-secondary)]">
                    Result
                  </p>
                  <pre className="overflow-x-auto max-h-40 rounded-md bg-[var(--color-surface)] p-2 text-xs text-[var(--color-success)] whitespace-pre-wrap break-all">
                    {formatResult(result)}
                  </pre>
                </div>
              )}

              {/* Error */}
              {status === 'error' && error && (
                <div>
                  <p className="mb-1 text-xs font-medium text-[var(--color-error)]">Error</p>
                  <pre className="overflow-x-auto rounded-md bg-[var(--color-error)]/5 p-2 text-xs text-[var(--color-error)] whitespace-pre-wrap break-all">
                    {error}
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
