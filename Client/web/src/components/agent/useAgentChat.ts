import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Agent attachment — single file/folder the user dragged or picked.
 * We only keep lightweight metadata (no real upload happens here yet).
 * `__TODO__: 接 Hermes OpenAI 兼容端点` will turn this into a real file
 * reference when task 4 wires the real backend.
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
}

export interface UseAgentChat {
  messages: AgentMessage[];
  isStreaming: boolean;
  attachments: AgentAttachment[];
  send: (text: string, attachments: AgentAttachment[]) => Promise<void>;
  cancel: () => void;
  removeAttachment: (id: string) => void;
  addAttachments: (items: AgentAttachment[]) => void;
  clear: () => void;
}

let _id = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(_id++).toString(36)}`;

/**
 * useAgentChat — UI-only chat state. Currently backed by a deterministic
 * mock (chunked typing simulation). When task 4 lands, swap the body of `send`
 * for a fetch/streaming call against the Hermes OpenAI-compatible endpoint
 * and replace the chunked setTimeout chain with real token events.
 *
 * __TODO__: 接 Hermes OpenAI 兼容端点 (replace mock with real stream).
 */
export function useAgentChat(): UseAgentChat {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  // Mark everything as cancelled if the hook unmounts mid-stream.
  useEffect(() => {
    return () => {
      cancelRef.current.cancelled = true;
    };
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const addAttachments = useCallback((items: AgentAttachment[]) => {
    setAttachments((prev) => [...prev, ...items]);
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current.cancelled = true;
    setIsStreaming(false);
    setMessages((prev) => prev.map((m) => (m.pending ? { ...m, pending: false } : m)));
  }, []);

  const clear = useCallback(() => {
    cancelRef.current.cancelled = true;
    setMessages([]);
    setIsStreaming(false);
    setAttachments([]);
  }, []);

  const send = useCallback(async (text: string, items: AgentAttachment[]) => {
    const trimmed = text.trim();
    if (!trimmed && items.length === 0) return;

    cancelRef.current.cancelled = false;
    const token = cancelRef.current;

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

    // __TODO__: 接 Hermes OpenAI 兼容端点 — replace the mock below with a
    // streaming fetch against `/api/hermes/chat` or the OpenAI-compatible
    // endpoint exposed by the runtime. The hook signature stays the same.
    const reply = mockReply(trimmed, items);
    const chunks = chunkString(reply, 18);
    const chunkDelay = 220; // ms — feels like real typing

    for (let i = 0; i < chunks.length; i++) {
      if (token.cancelled) return;
      await sleep(chunkDelay);
      if (token.cancelled) return;
      const isLast = i === chunks.length - 1;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content + chunks[i], pending: !isLast }
            : m,
        ),
      );
    }

    if (!token.cancelled) {
      setIsStreaming(false);
    }
  }, []);

  return {
    messages,
    isStreaming,
    attachments,
    send,
    cancel,
    removeAttachment,
    addAttachments,
    clear,
  };
}

/* ───────────────────────────  helpers  ─────────────────────────── */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkString(s: string, size: number): string[] {
  if (s.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) {
    out.push(s.slice(i, i + size));
  }
  return out;
}

function mockReply(text: string, attachments: AgentAttachment[]): string {
  const n = attachments.length;
  const fileNote =
    n === 0
      ? ''
      : `\n\n我看到你发了 ${n} 个附件 — 等真后端接好就能帮你看里面的内容了。`;
  const greet = text ? `关于「${truncate(text, 24)}」` : '你好';
  return `${greet}，这是个 mock 回复 — UI 层先跑通, 真正接 Hermes OpenAI 兼容端点是 task 4 的事。${fileNote}`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
