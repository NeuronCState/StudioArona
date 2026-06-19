import { useAuthStore } from "@/stores/auth";
import type { UIAction } from "@/types/ui-actions";

// ── SSE event types (discriminated union) ──

export type SSEEvent =
  | { type: "token"; text: string }
  | { type: "tool_call"; id: string; tool: string; args: unknown }
  | {
      type: "tool_result";
      id: string;
      tool: string;
      status: "ok" | "error";
      result?: unknown;
      error?: string;
    }
  | { type: "ui_action"; action: UIAction }
  | { type: "done" }
  | { type: "error"; message: string };

// ── Wire → typed event mapper ──

function parseSSEEvent(eventName: string, raw: unknown): SSEEvent | null {
  try {
    switch (eventName) {
      case "token": {
        const d = raw as { delta?: string; text?: string };
        return { type: "token", text: d.text ?? d.delta ?? "" };
      }
      case "tool_call": {
        const d = raw as {
          id: string;
          skill?: string;
          tool?: string;
          name?: string;
          args?: unknown;
          input?: unknown;
        };
        return {
          type: "tool_call",
          id: d.id,
          tool: d.tool ?? d.name ?? d.skill ?? "unknown",
          args: d.args ?? d.input,
        };
      }
      case "tool_result": {
        const d = raw as {
          id: string;
          skill?: string;
          tool?: string;
          status?: string;
          result?: unknown;
          summary?: unknown;
          error?: string;
        };
        const failed = d.status === "error" || !!d.error;
        return {
          type: "tool_result",
          id: d.id,
          tool: d.tool ?? d.skill ?? "unknown",
          status: failed ? "error" : "ok",
          result: d.result ?? d.summary,
          error: d.error,
        };
      }
      case "ui_action": {
        return { type: "ui_action", action: raw as UIAction };
      }
      case "done": {
        return { type: "done" };
      }
      case "error": {
        const d = raw as { message?: string };
        return { type: "error", message: d.message ?? "Unknown server error" };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ── CSRF token helper ──

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match ? match[1] : null;
}

// ── Connection factory ──

type SSEHandler = (event: SSEEvent) => void;

export function createSSEConnection(
  sessionId: string,
  content: string,
  onEvent: SSEHandler,
  onError?: (error: Error) => void,
): AbortController {
  const controller = new AbortController();
  const token = useAuthStore.getState().accessToken;

  fetch(`/api/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken() as string } : {}),
    },
    body: JSON.stringify({ content }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`SSE request failed: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const raw = line.slice(6);
            let data: unknown;
            try {
              data = JSON.parse(raw);
            } catch {
              data = raw;
            }

            const typed = parseSSEEvent(currentEvent, data);
            if (typed) {
              onEvent(typed);
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError?.(err);
      }
    });

  return controller;
}
