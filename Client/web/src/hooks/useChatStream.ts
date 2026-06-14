import { useCallback, useRef, useState } from 'react';
import { createSSEConnection, type SSEEvent } from '@/lib/sse-client';
import { dispatchUIAction } from '@/lib/ui-actions';

export interface ToolCallRecord {
  id: string;
  tool: string;
  args?: unknown;
  status: 'loading' | 'ok' | 'error';
  result?: unknown;
  error?: string;
  latencyMs?: number;
  startedAt?: number;
}

export interface StreamMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallRecord[];
  isStreaming?: boolean;
}

export function useChatStream(sessionId: string | null) {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const flushRef = useRef<number | null>(null);

  // Flush accumulated content to React state via requestAnimationFrame
  const scheduleFlush = useCallback(
    (getContent: () => string, getToolCalls: () => ToolCallRecord[], streaming: boolean) => {
      if (flushRef.current) return; // already scheduled
      flushRef.current = requestAnimationFrame(() => {
        flushRef.current = null;
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: getContent(),
              toolCalls: [...getToolCalls()],
              isStreaming: streaming,
            };
          }
          return updated;
        });
      });
    },
    [],
  );

  const sendMessage = useCallback(
    (content: string) => {
      if (!sessionId || isStreaming) return;

      // Add user message
      setMessages((prev) => [...prev, { role: 'user', content }]);

      // Start assistant message
      let assistantContent = '';
      const toolCalls: ToolCallRecord[] = [];

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '', toolCalls: [], isStreaming: true },
      ]);
      setIsStreaming(true);

      controllerRef.current = createSSEConnection(
        sessionId,
        content,
        (event: SSEEvent) => {
          switch (event.type) {
            case 'token': {
              assistantContent += event.text;
              scheduleFlush(
                () => assistantContent,
                () => toolCalls,
                true,
              );
              break;
            }
            case 'tool_call': {
              const record: ToolCallRecord = {
                id: event.id,
                tool: event.tool,
                args: event.args,
                status: 'loading',
                startedAt: Date.now(),
              };
              toolCalls.push(record);
              scheduleFlush(
                () => assistantContent,
                () => toolCalls,
                true,
              );
              break;
            }
            case 'tool_result': {
              const tc = toolCalls.find((t) => t.id === event.id);
              if (tc) {
                tc.status = event.status;
                tc.result = event.result;
                tc.error = event.error;
                tc.latencyMs = tc.startedAt ? Date.now() - tc.startedAt : undefined;
              }
              scheduleFlush(
                () => assistantContent,
                () => toolCalls,
                true,
              );
              break;
            }
            case 'ui_action': {
              dispatchUIAction(event.action);
              break;
            }
            case 'done': {
              // Force immediate flush on done
              if (flushRef.current) cancelAnimationFrame(flushRef.current);
              flushRef.current = null;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    content: assistantContent,
                    toolCalls: [...toolCalls],
                    isStreaming: false,
                  };
                }
                return updated;
              });
              setIsStreaming(false);
              break;
            }
            case 'error': {
              assistantContent += `\n\n⚠️ ${event.message}`;
              if (flushRef.current) cancelAnimationFrame(flushRef.current);
              flushRef.current = null;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    content: assistantContent,
                    isStreaming: false,
                  };
                }
                return updated;
              });
              setIsStreaming(false);
              break;
            }
          }
        },
        (error) => {
          console.error('SSE error:', error);
          setIsStreaming(false);
        },
      );
    },
    [sessionId, isStreaming, scheduleFlush],
  );

  const stopStreaming = useCallback(() => {
    controllerRef.current?.abort();
    if (flushRef.current) cancelAnimationFrame(flushRef.current);
    flushRef.current = null;
    setIsStreaming(false);
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last.role === 'assistant' && last.isStreaming) {
        updated[updated.length - 1] = { ...last, isStreaming: false };
      }
      return updated;
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, sendMessage, stopStreaming, clearMessages, isStreaming };
}
