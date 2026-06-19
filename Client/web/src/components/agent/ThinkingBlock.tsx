/**
 * ThinkingBlock — AI 思考过程可视化
 *
 * 借鉴 SonettoHere ThinkingBlock.vue 设计:
 * - 折叠面板, 思考中显示 spinner + 文字
 * - 完成后默认折叠 (整个 thinking header fade out)
 * - 视觉风格延续 StudioArona: framer-motion + var(--color-*) token
 *
 * 阶段 1 已准备好 AgentMessage.thinking 字段 (来自 SonettoHere on_llm_start/end event)
 */
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Brain } from "lucide-react";
import { useState } from "react";

interface ThinkingBlockProps {
  /** 思考文本 (server 端 LLM think 内容) */
  content: string;
  /** 是否完成 (on_llm_end 推完) */
  done: boolean;
  /** 完成后默认展开? 默认 false (折叠) */
  defaultOpen?: boolean;
}

export function ThinkingBlock({
  content,
  done,
  defaultOpen = false,
}: ThinkingBlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (!content && !done) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: done ? 0.85 : 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="my-2 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
        aria-expanded={open}
      >
        <Brain
          size={12}
          className={done ? "text-stone-400" : "animate-pulse text-amber-500"}
        />
        <span className="font-medium">{done ? "思考完成" : "思考中…"}</span>
        <ChevronDown
          size={12}
          className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {open && content && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-[var(--color-border)]"
          >
            <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap px-3 py-2 font-mono text-xs leading-relaxed text-[var(--color-text-secondary)]">
              {content}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
