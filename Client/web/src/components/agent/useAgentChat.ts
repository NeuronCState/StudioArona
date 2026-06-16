/**
 * useAgentChat — UI 状态 + SonettoHere LangGraph ReAct agent 流式对话
 *
 * 拍板 (2026-06-16):
 * - 替代 Hermes OpenAI 兼容协议, 切到 SonettoHere WebSocket /ws/chat/{session_id}
 * - SonettoHere 是 LangGraph ReAct agent, 自动 think→act→observe loop, 30+ tool
 * - 流式 event 协议: thinking_start / token / thinking_end / tool_start / tool_end /
 *   final_answer / error / context_usage (SonettoHere callback 推)
 * - Client 只消费 event, 不做 ReAct 编排 (server 端管)
 *
 * 视觉风格延续: AgentMessageList / AgentInput / AgentErrorToast 0 改,
 *   只在 message 流里新增 thinking / tool_calls 字段, 阶段 2 UI 升级消费这些字段
 *
 * 旧 Hermes 字段保留为 deprecated, 留 type 兼容, 不再 emit (3 字段都是 Hermes 私有)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSonettoConfigStore } from '@/stores/sonetto-config';

// ============================================================
// Types — SonettoHere 事件 schema
// ============================================================

export interface AgentAttachment {
  id: string;
  name: string;
  /** Tauri 桌面: ~/Documents/studioarona/... 绝对路径; Web 端: Blob URL */
  uri: string;
  size: number;
  mimeType: string;
  kind?: 'file' | 'folder';
  /** 内部 file ref (Web 端用) */
  file?: File;
}

export interface AgentToolCall {
  id: string;
  name: string;
  input: string;
  output?: string;
  status: 'running' | 'done' | 'error';
  startedAt: number;
  endedAt?: number;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  attachments?: AgentAttachment[];
  pending?: boolean;
  error?: string;
  /** ReAct thinking 文本 (折叠) */
  thinking?: string;
  /** 工具调用列表 (折叠) */
  toolCalls?: AgentToolCall[];
  /** 上下文用量 (server 推 context_usage) */
  contextUsage?: { used: number; max: number; percent: number; model: string };
}

export interface UseAgentChat {
  messages: AgentMessage[];
  isStreaming: boolean;
  lastError: string | null;
  send: (text: string, items: AgentAttachment[]) => Promise<void>;
  cancel: () => void;
  clear: () => void;
  retry: (messageId: string) => Promise<void>;
  sonettoReady: boolean | null;
  sonettoBaseUrl: string;
}

// ============================================================
// Helpers
// ============================================================

function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function humanizeNetworkError(err: unknown, baseUrl: string): string {
  if (err instanceof Error) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      return `连不上 SonettoHere (${baseUrl})。请确认已运行 SonettoHere, 或检查端口是否被防火墙挡住。`;
    }
    return err.message;
  }
  return String(err);
}

// ============================================================
// Hook
// ============================================================

const DEFAULT_SONETTO_BASE_URL = 'http://127.0.0.1:8081';
const PROBE_TIMEOUT_MS = 3000;

export function useAgentChat(): UseAgentChat {
  const { sonettoBaseUrl: storeBaseUrl, getActiveProvider } = useSonettoConfigStore();
  const sonettoBaseUrl = storeBaseUrl || DEFAULT_SONETTO_BASE_URL;

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [sonettoReady, setSonettoReady] = useState<boolean | null>(null);

  // Refs (avoid stale closures inside async callbacks)
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string>(`session-${Date.now().toString(36)}`);

  // --------------------------------------------------------
  // Probe SonettoHere /api/health (类似旧 probeHermes)
  // --------------------------------------------------------
  const probeSonetto = useCallback(async () => {
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(`${sonettoBaseUrl}/api/health`, { signal: ac.signal });
      setSonettoReady(res.ok);
    } catch {
      setSonettoReady(false);
    } finally {
      window.clearTimeout(timer);
    }
  }, [sonettoBaseUrl]);

  useEffect(() => {
    void probeSonetto();
  }, [probeSonetto]);

  // --------------------------------------------------------
  // Finalize helper: 标 done / error
  // --------------------------------------------------------
  const finalizeMessage = useCallback(
    (id: string, patch: Partial<AgentMessage>) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch, pending: false } : m)));
    },
    [],
  );

  // --------------------------------------------------------
  // Message mutation helpers
  // --------------------------------------------------------
  const appendDelta = useCallback((id: string, delta: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m)),
    );
  }, []);

  const addToolCall = useCallback(
    (messageId: string, tool: AgentToolCall) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, toolCalls: [...(m.toolCalls ?? []), tool] }
            : m,
        ),
      );
    },
    [],
  );

  // --------------------------------------------------------
  // Send: 走 SonettoHere WebSocket
  // --------------------------------------------------------
  const send = useCallback(
    async (text: string, items: AgentAttachment[]) => {
      const trimmed = text.trim();
      if (!trimmed && items.length === 0) return;

      cancelRef.current.cancelled = false;
      const token = cancelRef.current;

      // 1. Append user message
      const userMsg: AgentMessage = {
        id: nextId('u'),
        role: 'user',
        content: trimmed,
        createdAt: Date.now(),
        attachments: items.length > 0 ? items : undefined,
      };
      setMessages((prev) => [...prev, userMsg]);
      setLastError(null);

      // 2. Append pending assistant bubble
      const assistantId = nextId('a');
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          createdAt: Date.now(),
          pending: true,
        },
      ]);
      setIsStreaming(true);

      // 3. Build WebSocket URL
      const wsBase = sonettoBaseUrl.replace(/^http/, 'ws');
      const url = `${wsBase}/ws/chat/${sessionIdRef.current}`;

      // 4. Get active provider (SonettoHere 用来选 model)
      const active = getActiveProvider();

      // 5. Open WebSocket
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        const msg = humanizeNetworkError(err, sonettoBaseUrl);
        finalizeMessage(assistantId, { error: msg });
        setLastError(msg);
        setSonettoReady(false);
        setIsStreaming(false);
        return;
      }
      wsRef.current = ws;

      // Send message once connected
      ws.onopen = () => {
        if (token.cancelled) {
          ws.close();
          return;
        }
        ws.send(
          JSON.stringify({
            type: 'chat',
            payload: {
              message: trimmed,
              auto_approve: false,
              private: false,
              provider_id: active.id,
              model_name: active.models[0] || '',
            },
          }),
        );
      };

      // 6. Consume events
      ws.onmessage = (ev) => {
        if (token.cancelled) return;
        let evt: { type: string; payload?: any };
        try {
          evt = JSON.parse(ev.data);
        } catch {
          return;
        }
        switch (evt.type) {
          case 'thinking_start':
            // 标记开始 thinking (UI 折叠面板展开占位)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId && !m.thinking
                  ? { ...m, thinking: '' }
                  : m,
              ),
            );
            break;
          case 'token': {
            const tok = evt.payload?.token ?? '';
            if (tok) appendDelta(assistantId, tok);
            break;
          }
          case 'thinking_end':
            // thinking 段结束, 不动 content
            break;
          case 'tool_start': {
            const toolId = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            addToolCall(assistantId, {
              id: toolId,
              name: evt.payload?.tool_name ?? 'unknown',
              input: evt.payload?.input ?? '',
              status: 'running',
              startedAt: Date.now(),
            });
            break;
          }
          case 'tool_end': {
            // 找到最近一个 running 的同名 tool
            setMessages((prev) => {
              const m = prev.find((x) => x.id === assistantId);
              if (!m) return prev;
              const tool = [...(m.toolCalls ?? [])]
                .reverse()
                .find((t) => t.status === 'running');
              if (!tool) return prev;
              return prev.map((x) => {
                if (x.id !== assistantId) return x;
                return {
                  ...x,
                  toolCalls: (x.toolCalls ?? []).map((t) =>
                    t.id === tool.id
                      ? {
                          ...t,
                          status: 'done' as const,
                          output: evt.payload?.output ?? '',
                          endedAt: Date.now(),
                        }
                      : t,
                  ),
                };
              });
            });
            break;
          }
          case 'final_answer':
            // 可选: 覆盖 content (server 已通过 token 流推完, 这里兜底)
            if (typeof evt.payload?.content === 'string') {
              finalizeMessage(assistantId, { content: evt.payload.content });
            }
            break;
          case 'context_usage': {
            const u = evt.payload;
            if (u) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        contextUsage: {
                          used: u.used ?? 0,
                          max: u.max ?? 0,
                          percent: u.percent ?? 0,
                          model: u.model ?? '',
                        },
                      }
                    : m,
                ),
              );
            }
            break;
          }
          case 'error': {
            const msg = evt.payload?.message ?? 'SonettoHere 返回错误';
            finalizeMessage(assistantId, { error: msg });
            setLastError(msg);
            setSonettoReady(false);
            setIsStreaming(false);
            break;
          }
          case 'pong':
            // heartbeat 不用处理
            break;
        }
      };

      ws.onerror = () => {
        if (token.cancelled) return;
        const msg = `SonettoHere WebSocket 错误 (${sonettoBaseUrl}). 请确认 SonettoHere 已启动.`;
        finalizeMessage(assistantId, { error: msg });
        setLastError(msg);
        setSonettoReady(false);
        setIsStreaming(false);
      };

      ws.onclose = (ev) => {
        if (token.cancelled) return;
        if (ev.code !== 1000 && !ev.wasClean) {
          // 非正常关闭
          setMessages((prev) => {
            const m = prev.find((x) => x.id === assistantId);
            if (m && m.pending && !m.error) {
              const msg = `SonettoHere 关闭连接 (code ${ev.code}). 可能是异常退出.`;
              return prev.map((x) =>
                x.id === assistantId ? { ...x, error: msg, pending: false } : x,
              );
            }
            return prev;
          });
        } else {
          // 正常 close
          finalizeMessage(assistantId, {});
        }
        setIsStreaming(false);
      };
    },
    [
      sonettoBaseUrl,
      getActiveProvider,
      appendDelta,
      addToolCall,
      finalizeMessage,
    ],
  );

  // --------------------------------------------------------
  // Cancel: 关闭 ws + 标 cancelled
  // --------------------------------------------------------
  const cancel = useCallback(() => {
    cancelRef.current.cancelled = true;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'cancel', payload: {} }));
      } catch {
        /* ignore */
      }
      wsRef.current.close();
    }
    setIsStreaming(false);
  }, []);

  // --------------------------------------------------------
  // Clear
  // --------------------------------------------------------
  const clear = useCallback(() => {
    cancel();
    setMessages([]);
    setLastError(null);
  }, [cancel]);

  // --------------------------------------------------------
  // Retry: 重发最后一条 user message
  // --------------------------------------------------------
  const retry = useCallback(
    async (messageId: string) => {
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const msg = messages[idx];
      if (msg.role !== 'user') return;
      // 删掉该 user 后所有 assistant
      setMessages((prev) => prev.slice(0, idx));
      await send(msg.content, msg.attachments ?? []);
    },
    [messages, send],
  );

  return {
    messages,
    isStreaming,
    lastError,
    send,
    cancel,
    clear,
    retry,
    sonettoReady,
    sonettoBaseUrl,
  };
}

// ============================================================
// Test helpers (保留兼容旧测试)
// ============================================================
export function __setHermesConfigForTests(_partial: unknown): void {
  /* deprecated, no-op */
}
export function __resetHermesConfigForTests(): void {
  /* deprecated, no-op */
}
