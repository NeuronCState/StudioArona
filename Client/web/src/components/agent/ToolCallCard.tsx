/**
 * ToolCallCard — 工具调用可视化
 *
 * 借鉴 SonettoHere ToolCallCard.vue 设计:
 * - 折叠卡片, header (icon + 工具名 + 耗时) + body (参数 / 结果)
 * - status: running (spinner) / done (✓) / error (✗)
 * - 视觉风格延续 StudioArona: stone/amber 调色板
 */
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Wrench, Loader2, Check, X } from "lucide-react";
import { useState } from "react";
import type { AgentToolCall } from "./useAgentChat";

interface ToolCallCardProps {
  tool: AgentToolCall;
}

function getToolIcon(_name: string) {
  // 简化版: 全部用 Wrench icon; 后续可按 name 映射 (天气/地图/翻译/搜索)
  return Wrench;
}

function formatInput(input: string): string {
  // 简化: JSON 试着 pretty print, 否则原样
  try {
    return JSON.stringify(JSON.parse(input), null, 2);
  } catch {
    return input;
  }
}

export function ToolCallCard({ tool }: ToolCallCardProps) {
  const [open, setOpen] = useState(tool.status === "running");
  const Icon = getToolIcon(tool.name);
  const elapsed = tool.endedAt
    ? Math.round(((tool.endedAt - tool.startedAt) / 1000) * 10) / 10
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className={`my-1.5 overflow-hidden rounded-md border ${
        tool.status === "error"
          ? "border-red-300 dark:border-red-800"
          : tool.status === "done"
            ? "border-emerald-200 dark:border-emerald-900"
            : "border-amber-200 dark:border-amber-900"
      } bg-[var(--color-bg)]`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-[var(--color-surface)]"
        aria-expanded={open}
      >
        {tool.status === "running" ? (
          <Loader2 size={12} className="animate-spin text-amber-500" />
        ) : tool.status === "done" ? (
          <Check size={12} className="text-emerald-500" />
        ) : (
          <X size={12} className="text-red-500" />
        )}
        <Icon size={11} className="text-stone-500" />
        <span className="font-mono font-medium text-[var(--color-text-primary)]">
          {tool.name}
        </span>
        {elapsed !== null && (
          <span className="text-[10px] text-stone-400">{elapsed}s</span>
        )}
        <ChevronDown
          size={11}
          className={`ml-auto text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="border-t border-[var(--color-border)]"
          >
            {tool.input && tool.input !== "{}" && (
              <div className="border-b border-stone-100 px-2.5 py-1.5 dark:border-stone-800">
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                  参数
                </div>
                <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-[var(--color-text-secondary)]">
                  {formatInput(tool.input)}
                </pre>
              </div>
            )}
            {tool.output && (
              <div className="px-2.5 py-1.5">
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                  结果
                </div>
                <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-[var(--color-text-secondary)]">
                  {tool.output}
                </pre>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
