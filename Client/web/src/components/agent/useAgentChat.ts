import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Agent attachment — single file/folder the user dragged or picked.
 * We only keep lightweight metadata; when the backend supports multimodal
 * inputs we can promote `file` to a base64 data URL or upload handle.
 */
export interface AgentAttachment {
  id: string;
  name: string;
  size: number;
  kind: 'file' | 'folder';
  /** Browser File handle — kept so future upload pipeline can read it. */
  file?: File;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Unix ms */
  createdAt: number;
  attachments?: AgentAttachment[];
  /** True while the assistant is still streaming. */
  pending?: boolean;
  /** Set when the stream errored out — surfaces a user-friendly banner
   *  inline on the bubble so the user sees which turn failed. */
  error?: string;
}

export interface UseAgentChat {
  messages: AgentMessage[];
  isStreaming: boolean;
  /** Latest human-readable error from the last send attempt. Cleared
   *  on the next successful `send`; persists across renders until then.
   *  Drives the toast / banner surfaced by the panel. */
  lastError: string | null;
  attachments: AgentAttachment[];
  /** True until we've completed at least one health probe against the
   *  Hermes endpoint (success or failure). The panel can show a header
   *  chip of "Hermes: ok / Hermes: 未启动" once `hermesReady` is known. */
  hermesReady: boolean | null;
  send: (text: string, attachments: AgentAttachment[]) => Promise<void>;
  /** Re-send the user message that preceded the given assistant bubble.
   *  Wired to the inline "重试" button on failed assistant messages.
   *  No-op if the message isn't a failed assistant bubble or the
   *  matching user turn is missing. */
  retry: (assistantId: string) => Promise<void>;
  cancel: () => void;
  removeAttachment: (id: string) => void;
  addAttachments: (items: AgentAttachment[]) => void;
  clear: () => void;
  /** Re-probe Hermes `/v1/models`. Called automatically on mount; can be
   *  re-invoked by the header's "retry" chip. */
  probeHermes: () => Promise<void>;
  /** Manual error dismiss — used by the toast / banner close button. */
  dismissError: () => void;
}

let _id = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(_id++).toString(36)}`;

/* ───────────────────────  Hermes endpoint config  ─────────────────────── */

/**
 * Hermes OpenAI-compatible local endpoint.
 *
 * Hermes (>= 0.16) exposes a local OpenAI-compatible proxy via
 *   `hermes proxy start`         (default: 127.0.0.1:8645, provider: nous)
 * The proxy serves the standard OpenAI chat surface:
 *   - POST /v1/chat/completions   (supports stream:true → SSE)
 *   - GET  /v1/models
 *   - GET  /health
 * See `HERMES_INTEGRATION.md` for setup details and `hermes proxy start
 * --help` for the full flag set (--host, --port, --provider nous|xai).
 *
 * Override at build time with `VITE_HERMES_BASE_URL`, e.g. when Hermes
 * lives on a different host (Docker, remote workstation).
 */
export interface HermesConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export const DEFAULT_HERMES_CONFIG: HermesConfig = {
  baseUrl: 'http://127.0.0.1:8645',
  model: 'gpt-4o-mini',
  apiKey: 'local-hermes',
};

let _runtimeConfig: HermesConfig = {
  baseUrl:
    (import.meta.env.VITE_HERMES_BASE_URL as string | undefined) ??
    DEFAULT_HERMES_CONFIG.baseUrl,
  model:
    (import.meta.env.VITE_HERMES_MODEL as string | undefined) ??
    DEFAULT_HERMES_CONFIG.model,
  apiKey:
    (import.meta.env.VITE_HERMES_API_KEY as string | undefined) ??
    DEFAULT_HERMES_CONFIG.apiKey,
};

/** Test-only override; production code should set env vars instead. */
export function __setHermesConfigForTests(partial: Partial<HermesConfig>): void {
  _runtimeConfig = { ..._runtimeConfig, ...partial };
}

/** Test-only reset; mirrors the env-var fallback. */
export function __resetHermesConfigForTests(): void {
  _runtimeConfig = { ...DEFAULT_HERMES_CONFIG };
}

/* ───────────────────────────  Hook  ─────────────────────────── */

/**
 * useAgentChat — UI state + real Hermes OpenAI-compatible streaming.
 *
 * Each `send` POSTs the conversation so far to
 *   `${baseUrl}/v1/chat/completions` with `stream: true`, then
 * incrementally decodes the SSE deltas into the trailing assistant message.
 *
 * Failure modes the UI surfaces:
 *  - Hermes not running / network down       → fetch rejects → "Hermes 未启动"
 *  - Hermes returns 4xx/5xx (auth, upstream) → bubble shows error banner
 *  - User cancels / unmount                  → AbortController, partial bubble kept
 */
export function useAgentChat(): UseAgentChat {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [hermesReady, setHermesReady] = useState<boolean | null>(null);
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const abortRef = useRef<AbortController | null>(null);
  // Mirror of the latest `messages` so `retry` (a useCallback) can read
  // the current history without having `messages` in its deps. This is
  // the standard "latest ref" pattern; it sidesteps the stale-closure
  // problem when the user clicks "重试" right after a render.
  const messagesRef = useRef<AgentMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  // Send is declared further down; hold a ref so `retry` (defined before
  // `send`) can call the current implementation without a forward
  // declaration.
  const sendRef = useRef<(text: string, items: AgentAttachment[]) => Promise<void>>(
    async () => {},
  );

  // Mark everything as cancelled if the hook unmounts mid-stream.
  useEffect(() => {
    return () => {
      cancelRef.current.cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const addAttachments = useCallback((items: AgentAttachment[]) => {
    setAttachments((prev) => [...prev, ...items]);
  }, []);

  const dismissError = useCallback(() => setLastError(null), []);

  const cancel = useCallback(() => {
    cancelRef.current.cancelled = true;
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.pending ? { ...m, pending: false } : m)),
    );
  }, []);

  const retry = useCallback(async (assistantId: string) => {
    // Walk the current `messages` (captured at click time) to find the
    // failed assistant bubble and the user turn that immediately
    // preceded it. We re-send that turn as a brand-new conversation
    // turn — the failed assistant is left in place for history; a
    // fresh assistant bubble is appended by `send`.
    const all = messagesRef.current;
    const failedIdx = all.findIndex(
      (m) => m.id === assistantId && m.role === 'assistant' && m.error,
    );
    if (failedIdx < 0) return;
    const userMsg = all[failedIdx - 1];
    if (!userMsg || userMsg.role !== 'user') return;
    await sendRef.current(userMsg.content, userMsg.attachments ?? []);
  }, []);

  const clear = useCallback(() => {
    cancelRef.current.cancelled = true;
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setIsStreaming(false);
    setAttachments([]);
    setLastError(null);
  }, []);

  const probeHermes = useCallback(async () => {
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 3000);
    try {
      const res = await fetch(`${_runtimeConfig.baseUrl}/v1/models`, {
        method: 'GET',
        signal: ac.signal,
      });
      setHermesReady(res.ok);
    } catch {
      setHermesReady(false);
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  // Probe Hermes once on mount so the header can render a status chip
  // before the user ever sends a message.
  useEffect(() => {
    void probeHermes();
  }, [probeHermes]);

  const send = useCallback(
    async (text: string, items: AgentAttachment[]) => {
      const trimmed = text.trim();
      if (!trimmed && items.length === 0) return;

      cancelRef.current.cancelled = false;
      const token = cancelRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      setLastError(null);

      // 1. Append user message immediately.
      const userMsg: AgentMessage = {
        id: nextId('u'),
        role: 'user',
        content: trimmed,
        createdAt: Date.now(),
        attachments: items.length > 0 ? items : undefined,
      };
      setMessages((prev) => [...prev, userMsg]);
      setAttachments([]);

      // 2. Append a pending assistant bubble.
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

      // 3. Build the OpenAI request body from the full conversation so far.
      const conversation: OpenAIChatMessage[] = buildOpenAIMessages(
        messages,
        userMsg,
      );

      let response: Response;
      try {
        response = await fetch(`${_runtimeConfig.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${_runtimeConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: _runtimeConfig.model,
            messages: conversation,
            stream: true,
            temperature: 0.7,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        // Network-level failure — Hermes not running, port closed, CORS, etc.
        if (token.cancelled) return;
        const msg = humanizeNetworkError(err, _runtimeConfig.baseUrl);
        finalizeWithError(assistantId, msg);
        setLastError(msg);
        setHermesReady(false);
        return;
      }

      if (!response.ok) {
        // Hermes returned a non-2xx (auth failure, upstream 5xx, etc.).
        let detail = `${response.status} ${response.statusText}`;
        try {
          const body = (await response.json()) as { error?: { message?: string } };
          if (body?.error?.message) detail = body.error.message;
        } catch {
          /* body wasn't JSON — keep the status text */
        }
        const friendly =
          response.status === 401 || response.status === 403
            ? `Hermes 鉴权失败 (${response.status})。请检查 API key 或重新登录上游 provider。`
            : `Hermes 返回 ${detail}`;
        finalizeWithError(assistantId, friendly);
        setLastError(friendly);
        if (response.status === 401 || response.status === 403) {
          setHermesReady(false);
        }
        return;
      }

      if (!response.body) {
        const msg = 'Hermes 没有返回可读流 (response.body 为空)。';
        finalizeWithError(assistantId, msg);
        setLastError(msg);
        return;
      }

      // 4. Stream SSE deltas into the trailing assistant bubble.
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let totalContent = '';

      try {
        // SSE records are separated by a blank line. We parse per record
        // so a chunk that splits mid-record is handled on the next read.
        // Inside the loop an empty `delta` means heartbeat/comment and a
        // `null` means the [DONE] sentinel.
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (token.cancelled) break;

          buffer += decoder.decode(value, { stream: true });

          let sepIdx = buffer.indexOf('\n\n');
          while (sepIdx !== -1) {
            const record = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);
            const delta = parseSSERecord(record);
            if (delta === null) {
              // [DONE] sentinel — the upstream is signalling end of stream.
            } else if (delta) {
              totalContent += delta;
              appendDelta(assistantId, delta);
            }
            sepIdx = buffer.indexOf('\n\n');
          }
        }

        // Flush any trailing partial record (some upstreams don't end with
        // a blank line, especially when the connection is RST'd).
        if (buffer.trim().length > 0) {
          const delta = parseSSERecord(buffer);
          if (delta && delta.length > 0) {
            totalContent += delta;
            appendDelta(assistantId, delta);
          }
        }
      } catch (err) {
        if (token.cancelled) return; // expected on cancel
        const msg =
          err instanceof Error
            ? `流式连接中断: ${err.message}`
            : '流式连接中断。';
        finalizeWithError(assistantId, msg);
        setLastError(msg);
        return;
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* reader already released */
        }
        abortRef.current = null;
      }

      // 5. Mark the assistant bubble as finished.
      if (!token.cancelled) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: totalContent || m.content, pending: false }
              : m,
          ),
        );
        setIsStreaming(false);
        setHermesReady(true);
      }
    },
    [messages],
  );
  // Keep the ref in sync so `retry` always calls the latest `send`.
  sendRef.current = send;

  function appendDelta(id: string, delta: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m)),
    );
  }

  function finalizeWithError(id: string, message: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, pending: false, error: message } : m,
      ),
    );
    setIsStreaming(false);
    abortRef.current = null;
  }

  return {
    messages,
    isStreaming,
    lastError,
    hermesReady,
    attachments,
    send,
    retry,
    cancel,
    removeAttachment,
    addAttachments,
    clear,
    probeHermes,
    dismissError,
  };
}

/* ───────────────────────────  SSE / OpenAI helpers  ─────────────────────────── */

export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
  error?: { message?: string };
}

/**
 * Build the OpenAI chat-completions `messages` array from our internal
 * `AgentMessage` history plus the just-appended user turn. Attachments
 * are flattened to a text hint in the user content; once Hermes/multimodal
 * supports real images, swap this for the proper `content: [{type, ...}]`
 * shape.
 */
export function buildOpenAIMessages(
  history: AgentMessage[],
  newUser: AgentMessage,
): OpenAIChatMessage[] {
  const out: OpenAIChatMessage[] = [];

  for (const m of history) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: stringifyUserContent(m) });
    } else if (m.role === 'assistant' && m.content) {
      out.push({ role: 'assistant', content: m.content });
    }
  }
  out.push({ role: 'user', content: stringifyUserContent(newUser) });
  return out;
}

function stringifyUserContent(m: AgentMessage): string {
  if (!m.attachments || m.attachments.length === 0) return m.content;
  const lines = m.attachments.map(
    (a) => `- [${a.kind}] ${a.name} (${formatBytes(a.size)})`,
  );
  return `${m.content}\n\n附件:\n${lines.join('\n')}`;
}

/**
 * Parse one SSE record (possibly multi-line `data: ...` joined by newlines,
 * optionally preceded by `event:` / `id:` / `retry:`). Returns:
 *   - the extracted `delta.content` string when the payload is a valid
 *     OpenAI streaming chunk,
 *   - `null` if the record was the `[DONE]` sentinel,
 *   - `''` if the record had no `data` line (heartbeat / comment).
 *
 * Throws if the upstream sent a structured error inside the data payload
 * (matches `{ error: { message } }`), so the caller's stream loop can
 * surface it.
 */
export function parseSSERecord(record: string): string | null {
  const dataLines: string[] = [];
  for (const rawLine of record.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return '';
  const payload = dataLines.join('\n');
  if (payload === '[DONE]') return null;

  const parsed = JSON.parse(payload) as OpenAIStreamChunk;
  if (parsed.error?.message) {
    throw new Error(parsed.error.message);
  }
  return parsed.choices?.[0]?.delta?.content ?? '';
}

export function humanizeNetworkError(err: unknown, baseUrl: string): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError') {
      return '请求已取消。';
    }
    // TypeError is what `fetch` throws on a connection refused.
    if (err instanceof TypeError) {
      return `连不上 Hermes (${baseUrl})。请确认已运行 \`hermes proxy start\`，或检查端口是否被防火墙挡住。`;
    }
    return `Hermes 请求失败: ${err.message}`;
  }
  return `Hermes 请求失败: ${String(err)}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
