import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { listContainer as containerVariants } from "@/lib/motion";
import { AgentMessageItem } from "./AgentMessage";
import type { AgentMessage as ChatMessage } from "./useAgentChat";

interface AgentMessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  agentName: string;
  onRemoveAttachment: (id: string) => void;
  /** Re-trigger the previous user message. Wired by the panel to the
   *  inline retry button on failed assistant bubbles. */
  onRetry?: (assistantId: string) => void;
  /** 隐藏助手头像 (专注模式使用) */
  hideAvatar?: boolean;
}

export function AgentMessageList({
  messages,
  isStreaming,
  agentName,
  onRemoveAttachment,
  onRetry,
  hideAvatar,
}: AgentMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or streaming updates.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isStreaming]);

  const isEmpty = messages.length === 0;

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      aria-busy={isStreaming}
      aria-label="Conversation"
      className="flex-1 overflow-y-auto px-4 py-4"
    >
      {isEmpty ? (
        <EmptyState agentName={agentName} />
      ) : (
        <motion.div
          variants={containerVariants("list")}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-4"
        >
          {messages.map((msg) => (
            <AgentMessageItem
              key={msg.id}
              message={msg}
              onRemoveAttachment={onRemoveAttachment}
              agentName={agentName}
              onRetry={onRetry}
              hideAvatar={hideAvatar}
            />
          ))}
          <div ref={bottomRef} />
        </motion.div>
      )}
    </div>
  );
}

function EmptyState({ agentName }: { agentName: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="text-2xl">✨</div>
      <h2 className="text-base font-medium text-[var(--color-text-primary)]">
        和 {agentName} 聊聊
      </h2>
      <p className="max-w-xs text-xs text-[var(--color-text-muted)]">
        输入消息开始对话。按 Esc 退出专注模式。
      </p>
    </div>
  );
}
