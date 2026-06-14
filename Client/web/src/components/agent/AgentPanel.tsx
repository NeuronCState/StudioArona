import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { motion as m } from '@/lib/motion';
import { useAgentChat } from './useAgentChat';
import { AgentPanelHeader } from './AgentPanelHeader';
import { AgentMessageList } from './AgentMessageList';
import { AgentInput } from './AgentInput';
import { AgentErrorToast } from './AgentErrorToast';

interface AgentPanelProps {
  open: boolean;
  onClose: () => void;
  agentName?: string;
}

const DEFAULT_AGENT_NAME = '阿洛娜';

/**
 * AgentPanel — GPT-style chat surface that diffuses out of the centered
 * trigger button. Lives inside the right content area only (sidebar + header
 * remain visible). Supports Esc / outside-click to close and traps focus.
 *
 * The chat itself is backed by `useAgentChat`, which talks to the local
 * Hermes OpenAI-compatible endpoint via SSE. Connection / streaming
 * failures surface as a top-of-panel toast (dismissible) AND as an inline
 * banner on the failed assistant bubble.
 */
export function AgentPanel({ open, onClose, agentName = DEFAULT_AGENT_NAME }: AgentPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const chat = useAgentChat();

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Focus first interactive element when opened.
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const t = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {open && (
        <>
          {/* Soft backdrop — only covers the right content area so the
              sidebar + header remain visible. Click outside to close. */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: m.duration.fast / 1000, ease: m.easing.out }}
            onClick={onClose}
            aria-hidden="true"
            className="absolute inset-0 z-30 bg-black/15 backdrop-blur-[2px]"
          />

          <motion.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${agentName} 专注面板`}
            initial={{
              // Start as a small circle at the geometric center, mimicking
              // the trigger button. Origin set to "center center" so scale
              // grows from the middle.
              opacity: 0,
              scale: 0.06,
              borderRadius: 999,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              borderRadius: 20,
            }}
            exit={{
              opacity: 0,
              scale: 0.06,
              borderRadius: 999,
              transition: {
                duration: m.duration.base / 1000,
                ease: m.easing.inout,
              },
            }}
            transition={{
              type: 'spring',
              stiffness: 220,
              damping: 26,
              mass: 0.9,
            }}
            style={{ transformOrigin: '50% 50%' }}
            className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[480px] flex-col overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-3)] max-md:max-w-full max-md:inset-x-0"
          >
            <AgentPanelHeader
              agentName={agentName}
              onClose={onClose}
              hermesReady={chat.hermesReady}
              onRetryConnection={chat.probeHermes}
            />
            <div className="relative flex-1 overflow-hidden">
              <AgentMessageList
                messages={chat.messages}
                isStreaming={chat.isStreaming}
                agentName={agentName}
                onRemoveAttachment={chat.removeAttachment}
                onRetry={chat.retry}
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
              attachments={chat.attachments}
              isStreaming={chat.isStreaming}
              onSend={chat.send}
              onCancel={chat.cancel}
              onAddAttachments={chat.addAttachments}
              onRemoveAttachment={chat.removeAttachment}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
