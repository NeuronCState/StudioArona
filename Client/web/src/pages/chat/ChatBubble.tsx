import { useState } from 'react';
import { Copy, RefreshCw, ThumbsUp, ThumbsDown, Check, Pencil } from 'lucide-react';
import type { StreamMessage } from '@/hooks/useChatStream';
import { ToolCallCard } from './ToolCallCard';
import { TokenStream } from './TokenStream';
import { Avatar } from '@javis/ui-kit';

interface ChatBubbleProps {
  message: StreamMessage;
  onRegenerate?: () => void;
}

export function ChatBubble({ message, onRegenerate }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-in mb-4" data-testid="chat-bubble">
        <div className="group relative max-w-[600px] rounded-2xl rounded-br-md bg-white border border-[var(--color-border-subtle)] shadow-[var(--shadow-1)] px-4 py-3 hover:shadow-[var(--shadow-2)] transition-shadow duration-300">
          <div className="whitespace-pre-wrap break-words text-sm text-[var(--color-text-primary)]">
            {message.content}
          </div>
          {/* Hover toolbar */}
          <div className="absolute -bottom-6 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={handleCopy}
              className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] transition-colors"
              aria-label="复制"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
            <button
              className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] transition-colors"
              aria-label="编辑"
            >
              <Pencil size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex gap-4 animate-fade-in group/ai py-4 border-b border-[var(--color-border-subtle)] last:border-b-0" data-testid="chat-bubble">
      <div className="shrink-0 transition-transform duration-300 hover:scale-105">
        <Avatar alt="Arona" size="md" fallback="A" />
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-3 space-y-2 max-w-[500px]">
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Markdown content with refined editorial typesetting */}
        <div className="prose-javis font-sans text-sm leading-relaxed tracking-wide text-[var(--color-text-primary)]">
          <TokenStream content={message.content} isStreaming={!!message.isStreaming} />
        </div>

        {/* Action toolbar */}
        {!message.isStreaming && message.content && (
          <div className="mt-2 flex items-center gap-1 opacity-0 group-hover/ai:opacity-100 transition-opacity duration-200">
            <button
              onClick={handleCopy}
              className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-secondary)] transition-colors"
              aria-label="复制"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-secondary)] transition-colors"
                aria-label="重新生成"
              >
                <RefreshCw size={14} />
              </button>
            )}
            <button
              className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-secondary)] transition-colors"
              aria-label="赞"
            >
              <ThumbsUp size={14} />
            </button>
            <button
              className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-secondary)] transition-colors"
              aria-label="踩"
            >
              <ThumbsDown size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
