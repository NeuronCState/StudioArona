import { motion } from 'framer-motion';
import { motion as m, listItem as itemVariant } from '@/lib/motion';
import { Avatar } from '@javis/ui-kit';
import type { AgentMessage as ChatMessage } from './useAgentChat';
import { AgentAttachmentChip } from './AgentAttachment';

interface AgentMessageProps {
  message: ChatMessage;
  onRemoveAttachment: (id: string) => void;
  agentName: string;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

const userBubble =
  'bg-[var(--color-accent)] text-white rounded-2xl rounded-tr-md px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words';
const assistantBubble =
  'rounded-2xl rounded-tl-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-2 text-sm leading-relaxed text-[var(--color-text-primary)] whitespace-pre-wrap break-words';

export function AgentMessageItem({ message, onRemoveAttachment, agentName }: AgentMessageProps) {
  const isUser = message.role === 'user';
  return (
    <motion.div
      variants={itemVariant}
      initial="hidden"
      animate="show"
      transition={{ duration: m.duration.base / 1000, ease: m.easing.out }}
      className={`flex w-full gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
      data-role={message.role}
    >
      {!isUser && <Avatar size="sm" alt={agentName} />}
      <div className={`flex max-w-[80%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={isUser ? userBubble : assistantBubble}>
          {message.pending && message.content === '' ? <TypingDots /> : message.content}
        </div>
        {message.attachments && message.attachments.length > 0 && (
          <div className={`flex flex-wrap gap-1.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {message.attachments.map((a) => (
              <AgentAttachmentChip key={a.id} attachment={a} onRemove={onRemoveAttachment} />
            ))}
          </div>
        )}
        <span className="text-[10px] text-[var(--color-text-muted)]">{formatTime(message.createdAt)}</span>
      </div>
    </motion.div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1.5" aria-label="Assistant is typing">
      <span
        className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-bounce"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-bounce"
        style={{ animationDelay: '150ms' }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-bounce"
        style={{ animationDelay: '300ms' }}
      />
    </span>
  );
}
