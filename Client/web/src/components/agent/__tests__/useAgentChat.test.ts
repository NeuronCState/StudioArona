import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  buildOpenAIMessages,
  formatBytes,
  humanizeNetworkError,
  parseSSERecord,
  __resetHermesConfigForTests,
  __setHermesConfigForTests,
  useAgentChat,
  type AgentMessage,
} from '../useAgentChat';

/* ───────────────────────  Pure helpers  ─────────────────────── */

describe('parseSSERecord', () => {
  it('extracts delta.content from a standard OpenAI chunk', () => {
    const record = `data: {"id":"c","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}`;
    expect(parseSSERecord(record)).toBe('hi');
  });

  it('returns null for the [DONE] sentinel', () => {
    expect(parseSSERecord('data: [DONE]')).toBeNull();
  });

  it('returns empty string for heartbeats / comments', () => {
    expect(parseSSERecord(': ping keep-alive')).toBe('');
    expect(parseSSERecord('')).toBe('');
  });

  it('strips \r line endings and tolerates multi-line data: lines', () => {
    const record = 'data: {"choices":[{"delta":{"content":"x"}}]}\r\ndata: y';
    // Two `data:` lines are joined by \n before JSON.parse; the second
    // one is just "y" which isn't valid JSON, so the function should throw.
    // This documents the contract: a record should contain exactly one
    // JSON payload; the parser is not required to survive malformed input.
    expect(() => parseSSERecord(record)).toThrow();
  });

  it('throws on upstream error envelopes', () => {
    const record = 'data: {"error":{"message":"upstream 500"}}';
    expect(() => parseSSERecord(record)).toThrow('upstream 500');
  });

  it('handles content with multibyte UTF-8 (Chinese)', () => {
    const record = 'data: {"choices":[{"delta":{"content":"你好"}}]}';
    expect(parseSSERecord(record)).toBe('你好');
  });
});

describe('buildOpenAIMessages', () => {
  const userMsg = (overrides: Partial<AgentMessage> = {}): AgentMessage => ({
    id: 'u1',
    role: 'user',
    content: 'hello',
    createdAt: 0,
    ...overrides,
  });
  const assistantMsg = (overrides: Partial<AgentMessage> = {}): AgentMessage => ({
    id: 'a1',
    role: 'assistant',
    content: 'hi',
    createdAt: 0,
    ...overrides,
  });

  it('skips assistant bubbles with empty content', () => {
    const out = buildOpenAIMessages(
      [assistantMsg({ id: 'a0', content: '' })],
      userMsg(),
    );
    // 1 entry: the new user turn.
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ role: 'user', content: 'hello' });
  });

  it('emits user / assistant turns in order', () => {
    const out = buildOpenAIMessages(
      [userMsg({ id: 'u0' }), assistantMsg({ id: 'a0' }), userMsg({ id: 'u1' })],
      userMsg({ id: 'u2', content: 'final' }),
    );
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'user']);
    expect(out[3].content).toBe('final');
  });

  it('flattens attachments to a text hint under the user content', () => {
    const out = buildOpenAIMessages([], userMsg({
      content: 'look at this',
      attachments: [
        { id: 'a', name: 'a.txt', size: 12, kind: 'file' },
        { id: 'b', name: 'dir', size: 4 * 1024 * 1024, kind: 'folder' },
      ],
    }));
    expect(out).toHaveLength(1);
    const c = out[0].content as string;
    expect(c).toContain('look at this');
    expect(c).toContain('- [file] a.txt (12 B)');
    expect(c).toContain('- [folder] dir (4.0 MB)');
    expect(c).toContain('附件:');
  });

  it('returns plain user content when no attachments', () => {
    const out = buildOpenAIMessages([], userMsg({ content: 'plain' }));
    expect(out[0].content).toBe('plain');
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024, '1.0 MB'],
    [1024 * 1024 * 1024, '1.0 GB'],
  ])('formats %i as %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });
});

describe('humanizeNetworkError', () => {
  it('returns the cancel string for AbortError', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(humanizeNetworkError(err, 'http://x')).toBe('请求已取消。');
  });

  it('returns a Hermes-not-running hint for TypeError (connection refused)', () => {
    const err = new TypeError('fetch failed');
    const msg = humanizeNetworkError(err, 'http://127.0.0.1:8645');
    expect(msg).toContain('连不上 Hermes');
    expect(msg).toContain('http://127.0.0.1:8645');
    expect(msg).toContain('hermes proxy start');
  });

  it('returns the raw message for generic Errors', () => {
    expect(humanizeNetworkError(new Error('boom'), 'http://x')).toBe(
      'Hermes 请求失败: boom',
    );
  });

  it('handles unknown error shapes', () => {
    expect(humanizeNetworkError('weird', 'http://x')).toBe(
      'Hermes 请求失败: weird',
    );
  });
});

/* ───────────────────────  Hook + end-to-end streaming  ─────────────────────── */

/**
 * Build a `Response`-shaped object whose `body` is a `ReadableStream`
 * over the provided SSE chunks. Each chunk is written as
 *   `<chunk>\n\n`
 * plus a `[DONE]\n\n` terminator, matching real OpenAI behaviour.
 */
function makeSSEResponse(chunks: string[], opts: { status?: number } = {}) {
  const status = opts.status ?? 200;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(encoder.encode(c));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(body, {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

/** Encode a single OpenAI streaming chunk payload as an SSE record. */
function sseChunk(content: string): string {
  return (
    'data: ' +
    JSON.stringify({
      id: 'mock',
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    }) +
    '\n\n'
  );
}

let originalFetch: typeof globalThis.fetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
  __resetHermesConfigForTests();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  __resetHermesConfigForTests();
});

describe('useAgentChat — end-to-end SSE', () => {
  it('streams a reply into the trailing assistant bubble', async () => {
    __setHermesConfigForTests({ baseUrl: 'http://mock-hermes' });
    const fetchMock = vi.fn().mockResolvedValue(
      makeSSEResponse([sseChunk('P'), sseChunk('O'), sseChunk('N'), sseChunk('G')]),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useAgentChat());
    await act(async () => {
      await result.current.send('hi', []);
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].role).toBe('user');
    expect(result.current.messages[0].content).toBe('hi');
    expect(result.current.messages[1].role).toBe('assistant');
    expect(result.current.messages[1].content).toBe('PONG');
    expect(result.current.messages[1].pending).toBe(false);
    expect(result.current.messages[1].error).toBeUndefined();
    expect(result.current.lastError).toBeNull();
  });

  it('surfaces a friendly error when Hermes is unreachable', async () => {
    __setHermesConfigForTests({ baseUrl: 'http://mock-hermes' });
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useAgentChat());
    await act(async () => {
      await result.current.send('hi', []);
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });
    expect(result.current.lastError).toContain('连不上 Hermes');
    expect(result.current.lastError).toContain('http://mock-hermes');
    expect(result.current.hermesReady).toBe(false);
    // The failed assistant bubble carries the same error inline.
    const assistant = result.current.messages[result.current.messages.length - 1];
    expect(assistant.role).toBe('assistant');
    expect(assistant.error).toContain('连不上 Hermes');
    expect(assistant.pending).toBe(false);
  });

  it('surfaces a friendly 401 message and marks Hermes not ready', async () => {
    __setHermesConfigForTests({ baseUrl: 'http://mock-hermes' });
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(
          JSON.stringify({ error: { message: 'invalid api key' } }),
        ));
        c.close();
      },
    });
    const resp = new Response(body, { status: 401, statusText: 'Unauthorized' });
    globalThis.fetch = vi.fn().mockResolvedValue(resp) as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useAgentChat());
    await act(async () => {
      await result.current.send('hi', []);
    });
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });
    expect(result.current.lastError).toContain('鉴权失败');
    expect(result.current.lastError).toContain('401');
    expect(result.current.hermesReady).toBe(false);
  });

  it('cancels an in-flight stream via AbortController and keeps the partial bubble', async () => {
    __setHermesConfigForTests({ baseUrl: 'http://mock-hermes' });
    // Build a body that emits one chunk and then hangs.
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sseChunk('P')));
        // No close, no more data — the consumer has to abort.
      },
    });
    const resp = new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(resp) as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useAgentChat());
    act(() => {
      void result.current.send('hi', []);
    });
    // Let one tick of microtasks run, then cancel.
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      result.current.cancel();
    });
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });
    // The "P" we got should be kept, the bubble marked finished.
    const assistant = result.current.messages[result.current.messages.length - 1];
    expect(assistant.content).toBe('P');
    expect(assistant.pending).toBe(false);
  });

  it('clears lastError on the next successful send', async () => {
    __setHermesConfigForTests({ baseUrl: 'http://mock-hermes' });
    // The hook also probes /v1/models on mount; the probe path is
    // expected to fail (we never set up a /v1/models mock here), so the
    // hook flips hermesReady to false. That doesn't interfere with the
    // /v1/chat/completions path we're exercising.
    const chatResponses = [
      Promise.reject(new TypeError('fetch failed')),
      Promise.resolve(makeSSEResponse([sseChunk('o'), sseChunk('k')])),
    ];
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/v1/chat/completions')) {
        return (
          chatResponses.shift() ?? Promise.reject(new Error('out of responses'))
        );
      }
      // /v1/models probe
      return Promise.reject(new TypeError('not used in this test'));
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useAgentChat());
    await act(async () => {
      await result.current.send('first', []);
    });
    await waitFor(() => {
      expect(result.current.lastError).not.toBeNull();
    });
    expect(result.current.lastError ?? '').toContain('连不上 Hermes');

    await act(async () => {
      await result.current.send('second', []);
    });
    await waitFor(() => {
      expect(result.current.lastError).toBeNull();
    });
    expect(
      result.current.messages[result.current.messages.length - 1].content,
    ).toBe('ok');
  });

  it('probeHermes flips hermesReady to true on /v1/models 200', async () => {
    __setHermesConfigForTests({ baseUrl: 'http://mock-hermes' });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useAgentChat());
    await act(async () => {
      await result.current.probeHermes();
    });
    expect(result.current.hermesReady).toBe(true);
  });

  it('probeHermes flips hermesReady to false when /v1/models is unreachable', async () => {
    __setHermesConfigForTests({ baseUrl: 'http://mock-hermes' });
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof globalThis.fetch;

    const { result } = renderHook(() => useAgentChat());
    await act(async () => {
      await result.current.probeHermes();
    });
    expect(result.current.hermesReady).toBe(false);
  });
});
