import { useEffect, useRef, useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSessionStore } from '@/stores/session';
import { useAuthStore } from '@/stores/auth';
import { useChatStream } from '@/hooks/useChatStream';
import { api } from '@/lib/api/client';
import { DynamicRender } from '@/lib/component-registry';
import { setRenderCardHandler } from '@/lib/ui-actions';
import type { ChatSession } from '@/types/contracts';
import { ChatBubble } from './ChatBubble';
import { ChatInput } from './ChatInput';
import { DashboardCards } from './DashboardCards';
import { ScrollToBottom } from '@/components/ui/ScrollToBottom';
import { MessageCircle } from 'lucide-react';

interface AppendedCard {
  name: string;
  props: Record<string, unknown>;
  id: string;
}

export function ChatPage() {
  const wakeState = useSessionStore((s) => s.wakeState);
  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const setCurrentSessionId = useSessionStore((s) => s.setCurrentSessionId);
  const user = useAuthStore((s) => s.user);
  const { messages, sendMessage, stopStreaming, clearMessages, isStreaming } =
    useChatStream(currentSessionId);
  const [appendedCards, setAppendedCards] = useState<AppendedCard[]>([]);
  const messagesRef = useRef<HTMLDivElement>(null);

  const isChatMode = wakeState === 'active' || (user && wakeState === 'idle');

  // Wire render_card handler
  useEffect(() => {
    setRenderCardHandler((name, props) => {
      setAppendedCards((prev) => [
        ...prev,
        { name, props, id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
      ]);
    });
  }, []);

  // Auto-create session
  const sessionMutation = useMutation({
    mutationFn: () => api.post<ChatSession>('/chat/sessions'),
    onSuccess: (session) => setCurrentSessionId(session.id),
  });

  useEffect(() => {
    if (isChatMode && !currentSessionId) {
      sessionMutation.mutate();
    }
  }, [isChatMode, currentSessionId]);

  // Handle leave
  useEffect(() => {
    if (wakeState === 'idle' && currentSessionId) {
      clearMessages();
      setCurrentSessionId(null);
      setAppendedCards([]);
    }
  }, [wakeState, currentSessionId, clearMessages, setCurrentSessionId]);

  // Listen for clear_session events
  useEffect(() => {
    const handler = () => {
      clearMessages();
      setAppendedCards([]);
    };
    window.addEventListener('javis:clear-session', handler);
    return () => window.removeEventListener('javis:clear-session', handler);
  }, [clearMessages]);

  const handleRegenerate = useCallback(() => {
    // Remove last assistant message and re-send last user message
    const userMsgs = messages.filter((m) => m.role === 'user');
    if (userMsgs.length === 0) return;
    const lastUser = userMsgs[userMsgs.length - 1];
    setAppendedCards([]);
    stopStreaming();
    clearMessages();
    setTimeout(() => sendMessage(lastUser.content), 100);
  }, [messages, sendMessage, stopStreaming, clearMessages]);

  if (!isChatMode) {
    return <DashboardCards />;
  }

  const hasContent = messages.length > 0 || appendedCards.length > 0;

  return (
    <div className="relative flex h-full flex-col">
      {/* Messages area */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto" aria-live="polite">
        <div className="mx-auto max-w-[768px] px-4 py-6">
          {!hasContent ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-accent)] shadow-[var(--shadow-2)]">
                <MessageCircle size={32} className="text-white" />
              </div>
              <h2 className="font-serif text-lg font-semibold text-[var(--color-text-primary)]">
                什亭之匣 · 阿洛娜
              </h2>
              <p className="mt-2 max-w-sm text-sm text-[var(--color-text-secondary)]">
                我是你的智能工作室助手阿洛娜。可以问我系统状态、管理虚拟机、订阅 RSS，或者随便聊聊天。
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {['系统运行状态如何？', '帮我添加一个 RSS 源', '查看我的日程', '创建一个 Ubuntu 虚拟机'].map(
                  (hint) => (
                    <button
                      key={hint}
                      onClick={() => sendMessage(hint)}
                      className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                      {hint}
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, i) => (
                <ChatBubble
                  key={i}
                  message={msg}
                  onRegenerate={
                    i === messages.length - 1 && msg.role === 'assistant'
                      ? handleRegenerate
                      : undefined
                  }
                />
              ))}

              {/* Appended cards from ui_action render_card */}
              {appendedCards.map((card) => (
                <div key={card.id} className="animate-fade-in">
                  <DynamicRender name={card.name} props={card.props} />
                </div>
              ))}
            </div>
          )}
        </div>
        <ScrollToBottom containerRef={messagesRef} />
      </div>

      {/* Input area */}
      <div className="bg-[var(--color-bg)] p-4 pb-6">
        <div className="mx-auto max-w-[768px]">
          <ChatInput onSend={sendMessage} isStreaming={isStreaming} onStop={stopStreaming} />
        </div>
      </div>
    </div>
  );
}
