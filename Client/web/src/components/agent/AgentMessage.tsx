import { motion } from "framer-motion";
import { AlertCircle, RefreshCw } from "lucide-react";
import { motion as m, listItem as itemVariant } from "@/lib/motion";
import { Avatar } from "@javis/ui-kit";
import type { AgentMessage as ChatMessage } from "./useAgentChat";
import { AgentAttachmentChip } from "./AgentAttachment";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallCard } from "./ToolCallCard";

interface AgentMessageProps {
  message: ChatMessage;
  onRemoveAttachment: (id: string) => void;
  agentName: string;
  /** Re-send the *previous* user message verbatim. Wired by the panel to
   *  the failed assistant bubble's "重试" button so the user can recover
   *  from an agent service outage without retyping. */
  onRetry?: (assistantId: string) => void;
  /** 隐藏助手头像 (专注模式使用) */
  hideAvatar?: boolean;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

const userBubble =
  "bg-[var(--color-accent)] text-white rounded-2xl rounded-tr-md px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words";
const assistantBubble =
  "rounded-2xl rounded-tl-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-2 text-sm leading-relaxed text-[var(--color-text-primary)] whitespace-pre-wrap break-words";
const assistantErrorBubble =
  "rounded-2xl rounded-tl-md border border-[var(--color-error)]/40 bg-[var(--color-error)]/5 px-3.5 py-2 text-sm leading-relaxed text-[var(--color-text-primary)] whitespace-pre-wrap break-words";

export function AgentMessageItem({
  message,
  onRemoveAttachment,
  agentName,
  onRetry,
  hideAvatar,
}: AgentMessageProps) {
  const isUser = message.role === "user";
  const hasError = Boolean(message.error);
  return (
    <motion.div
      variants={itemVariant}
      initial="hidden"
      animate="show"
      transition={{ duration: m.duration.base / 1000, ease: m.easing.out }}
      className={`flex w-full gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
      data-role={message.role}
      data-error={hasError ? "true" : undefined}
    >
      {!isUser && !hideAvatar && <Avatar size="sm" alt={agentName} />}
      <div
        className={`flex max-w-[80%] flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
      >
        {hasError ? (
          <div
            className="flex flex-col gap-1.5"
            data-testid="agent-message-error"
          >
            <div className={assistantErrorBubble}>
              <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-error)]">
                <AlertCircle size={12} aria-hidden="true" />
                <span>生成失败</span>
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                {message.content || "（无内容）"}
              </p>
              <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">
                {message.error}
              </p>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={() => onRetry(message.id)}
                className="inline-flex items-center gap-1 self-start rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                aria-label="重试"
              >
                <RefreshCw size={10} aria-hidden="true" />
                <span>重试</span>
              </button>
            )}
          </div>
        ) : (
          <div
            className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
          >
            {isUser ? (
              message.content ? (
                <div className={userBubble}>{message.content}</div>
              ) : null
            ) : (
              <>
                {/* AI 思考过程折叠面板 */}
                {message.thinking !== undefined && (
                  <ThinkingBlock
                    content={message.thinking}
                    done={!message.pending && message.content.length > 0}
                  />
                )}
                {/* 工具调用列表 (每个 tool 一个折叠卡片) */}
                {message.toolCalls && message.toolCalls.length > 0 && (
                  <div className="w-full">
                    {message.toolCalls.map((tool) => (
                      <ToolCallCard key={tool.id} tool={tool} />
                    ))}
                  </div>
                )}
                {/* 主回复 (token 流) */}
                <div className={assistantBubble}>
                  {message.pending && message.content === "" ? (
                    <TypingDots />
                  ) : (
                    message.content
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div
            className={`flex flex-wrap gap-1.5 ${isUser ? "justify-end" : "justify-start"}`}
          >
            {message.attachments.map((a) => (
              <AgentAttachmentChip
                key={a.id}
                attachment={a}
                onRemove={onRemoveAttachment}
              />
            ))}
          </div>
        )}
        <span className="text-[10px] text-[var(--color-text-muted)]">
          {formatTime(message.createdAt)}
        </span>
      </div>
    </motion.div>
  );
}

function TypingDots() {
  return (
    <span
      className="inline-flex items-center gap-1.5"
      aria-label="Assistant is typing"
    >
      <span
        className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-bounce"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-bounce"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-bounce"
        style={{ animationDelay: "300ms" }}
      />
    </span>
  );
}
