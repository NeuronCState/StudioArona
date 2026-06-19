import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFocusChatsStore } from "@/stores/focus-chats";
import { useAgentChat } from "./useAgentChat";

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: Pick<CloseEvent, "code" | "wasClean">) => void) | null =
    null;
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  emit(type: string, payload: object) {
    this.onmessage?.({
      data: JSON.stringify({ type, payload }),
    } as MessageEvent<string>);
  }

  close(code = 1000) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, wasClean: code === 1000 });
  }
}

describe("useAgentChat", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    useFocusChatsStore.setState({
      chats: [{ id: "chat-1", title: "新对话 1", createdAt: 1, updatedAt: 1 }],
      activeChatId: "chat-1",
      messagesByChat: {},
    });
  });

  it("uses the chat id as the session and stops streaming on done", async () => {
    const { result } = renderHook(() => useAgentChat("chat-1"));

    await act(async () => result.current.send("你好", []));
    const socket = MockWebSocket.instances[0];
    expect(socket.url).toBe("ws://127.0.0.1:8081/ws/chat/chat-1");

    act(() => socket.open());
    expect(socket.send).toHaveBeenCalledWith(
      expect.stringContaining('"message":"你好"'),
    );

    act(() => {
      socket.emit("final_answer", { content: "你好，需要我做什么？" });
      socket.emit("done", {
        context_usage: { used: 20, max: 100, percent: 20, model: "test-model" },
      });
    });

    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(
      result.current.messages[result.current.messages.length - 1],
    ).toMatchObject({
      role: "assistant",
      content: "你好，需要我做什么？",
      pending: false,
      contextUsage: { used: 20, max: 100, percent: 20, model: "test-model" },
    });
  });

  it("encodes attachments into the Sonetto chat payload", async () => {
    const { result } = renderHook(() => useAgentChat("chat-1"));
    const file = {
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([104, 105]).buffer),
      webkitRelativePath: "notes/readme.txt",
    } as unknown as File;

    await act(async () =>
      result.current.send("", [
        {
          id: "attachment-1",
          name: "readme.txt",
          uri: "",
          size: 2,
          mimeType: "text/plain",
          kind: "folder",
          relativePath: "notes/readme.txt",
          file,
        },
      ]),
    );

    const socket = MockWebSocket.instances[0];
    act(() => socket.open());
    const payload = JSON.parse(socket.send.mock.calls[0][0]);
    expect(payload.payload.attachments).toEqual([
      {
        name: "readme.txt",
        relative_path: "notes/readme.txt",
        size: 2,
        mime_type: "text/plain",
        content_base64: "aGk=",
      },
    ]);
  });
});
