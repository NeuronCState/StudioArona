import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { motion as m } from "@/lib/motion";
import { useAgentChat, type AgentAttachment } from "./useAgentChat";
import { AgentPanelHeader } from "./AgentPanelHeader";
import { AgentMessageList } from "./AgentMessageList";
import { TaskTrackerBar } from "./TaskTrackerBar";
import { AgentInput } from "./AgentInput";
import { AgentErrorToast } from "./AgentErrorToast";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface AgentPanelProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  agentName?: string;
}

const DEFAULT_AGENT_NAME = "阿洛娜";

/**
 * AgentPanel — GPT-style chat surface that diffuses out of the centered
 * trigger button. Lives inside the right content area only (sidebar + header
 * remain visible). Supports Esc / outside-click to close.
 *
 * The chat itself is backed by `useAgentChat`, which talks to the local
 * Hermes OpenAI-compatible endpoint via SSE. Connection / streaming
 * failures surface as a top-of-panel toast (dismissible) AND as an inline
 * banner on the failed assistant bubble.
 */
export function AgentPanel({
  open,
  onClose,
  sessionId,
  agentName = DEFAULT_AGENT_NAME,
}: AgentPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const chat = useAgentChat(sessionId);
  const reducedMotion = useReducedMotion();
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const handleAddAttachments = useCallback((items: AgentAttachment[]) => {
    setAttachments((current) => [...current, ...items]);
  }, []);
  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((current) => current.filter((item) => item.id !== id));
  }, []);

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Wait for the expansion animation, then put the cursor where interaction starts.
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const t = window.setTimeout(
      () => {
        panelRef.current
          ?.querySelector<HTMLTextAreaElement>("textarea")
          ?.focus();
      },
      reducedMotion ? 0 : 600,
    );
    return () => window.clearTimeout(t);
  }, [open, reducedMotion, sessionId]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {open && (
        <>
          {/* Soft backdrop — only covers the right content area so the
              sidebar + header remain visible. Click outside to close. */}
          <motion.div
            key="backdrop"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: reducedMotion ? 0 : m.duration.fast / 1000,
              ease: m.easing.out,
            }}
            onClick={onClose}
            aria-hidden="true"
            className="fixed bottom-0 left-[240px] right-0 top-0 z-30 bg-black/15 backdrop-blur-[2px]"
          />

          <motion.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-label={`${agentName} 专注面板`}
            initial={reducedMotion ? false : { opacity: 0, y: 40 }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              y: 40,
              transition: {
                duration: reducedMotion ? 0 : m.duration.base / 1000,
                ease: m.easing.inout,
              },
            }}
            transition={{
              duration: reducedMotion ? 0 : 0.3,
              delay: reducedMotion ? 0 : 0.25,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="fixed bottom-2 left-[248px] right-2 top-2 z-40 flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-3)]"
          >
            <AgentPanelHeader
              agentName={agentName}
              onClose={onClose}
              sonettoReady={chat.sonettoReady}
              onRetryConnection={chat.retryConnection}
            />
            <div className="relative flex-1 overflow-hidden">
              {/* 顶部任务进度条: 当前 assistant message 的 tool calls */}
              {(() => {
                const last = chat.messages
                  .filter((m) => m.role === "assistant")
                  .slice(-1)[0];
                if (!last?.toolCalls?.length) return null;
                return <TaskTrackerBar toolCalls={last.toolCalls} />;
              })()}
              <AgentMessageList
                messages={chat.messages}
                isStreaming={chat.isStreaming}
                agentName={agentName}
                onRemoveAttachment={handleRemoveAttachment}
                onRetry={chat.retry}
                hideAvatar
              />
              {/* Floating toast for the latest send failure. Sits at the top
                  of the message area so it doesn't shift the conversation
                  layout when it appears / disappears. */}
              <AgentErrorToast
                message={chat.lastError}
                onDismiss={chat.dismissError}
              />
            </div>
            <AgentInput
              attachments={attachments}
              isStreaming={chat.isStreaming}
              onSend={async (text, items) => {
                const accepted = await chat.send(text, items);
                if (accepted) setAttachments([]);
                return accepted;
              }}
              onCancel={chat.cancel}
              onAddAttachments={handleAddAttachments}
              onRemoveAttachment={handleRemoveAttachment}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
