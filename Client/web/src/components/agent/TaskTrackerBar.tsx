/**
 * TaskTrackerBar — 顶部任务进度条
 *
 * 借鉴 SonettoHere TaskTrackerBar.vue 设计:
 * - 顶部 sticky 横条, "current / total · 状态 · 当前操作 · 进度%"
 * - 用于 LLM 一次调多个 tool 时, 让用户看到 "Step 2/5: 正在查天气..."
 * - 视觉风格: stone 调色板 + 极薄 (1px 高), 不抢聊天内容
 */
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle, ListTodo } from 'lucide-react';
import type { AgentToolCall } from './useAgentChat';

interface TaskTrackerBarProps {
  /** 当前轮所有 tool calls (running + done + error) */
  toolCalls: AgentToolCall[];
}

export function TaskTrackerBar({ toolCalls }: TaskTrackerBarProps) {
  if (toolCalls.length === 0) return null;

  const total = toolCalls.length;
  const done = toolCalls.filter((t) => t.status === 'done').length;
  const errored = toolCalls.filter((t) => t.status === 'error').length;
  const inProgress = toolCalls.find((t) => t.status === 'running');
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  const statusLabel = inProgress
    ? `正在执行: ${inProgress.name}`
    : errored > 0
    ? `${errored} 个失败`
    : done === total
    ? '全部完成'
    : '准备中…';

  const StatusIcon = inProgress
    ? Loader2
    : errored > 0
    ? XCircle
    : done === total
    ? CheckCircle2
    : ListTodo;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-3 py-1.5 text-[11px] text-stone-600 dark:border-stone-800 dark:bg-stone-900/50 dark:text-stone-400"
    >
      <StatusIcon
        size={11}
        className={inProgress ? 'animate-spin text-amber-500' : errored > 0 ? 'text-red-500' : 'text-emerald-500'}
      />
      <span className="font-mono font-medium">
        <span className="text-stone-900 dark:text-stone-100">{done}</span>
        <span className="text-stone-400"> / {total}</span>
      </span>
      <span className="text-stone-300">·</span>
      <span className="flex-1 truncate">{statusLabel}</span>
      <div className="h-1 w-24 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
        <motion.div
          className={`h-full ${
            errored > 0 ? 'bg-red-400' : inProgress ? 'bg-amber-400' : 'bg-emerald-400'
          }`}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <span className="w-8 text-right font-mono text-stone-500">{percent}%</span>
    </motion.div>
  );
}
