/// <reference lib="webworker" />

/**
 * SharedWorker that manages one WebSocket connection shared across all tabs.
 *
 * Protocol (port -> worker):
 *   { type: 'ready' }            — signal the port is ready to receive events
 *   { type: 'send', payload }    — send a message through the shared WS
 *
 * Protocol (worker -> port):
 *   { type: 'event', event: WSEvent }   — an incoming WS event
 */

const WS_URL = ((): string => {
  // The worker runs in a WorkerGlobalScope — self.location gives the origin.
  const proto = self.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${self.location.host}/ws/events`;
})();

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

const ports = new Set<MessagePort>();
let ws: WebSocket | null = null;
let backoff = INITIAL_BACKOFF_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function broadcast(data: unknown): void {
  for (const port of ports) {
    try {
      port.postMessage(data);
    } catch {
      // Port may be closed; it will be cleaned up on next send
    }
  }
}

function connect(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    backoff = INITIAL_BACKOFF_MS;
  };

  ws.onmessage = (e: MessageEvent) => {
    try {
      const event = JSON.parse(e.data as string);
      broadcast({ type: 'event', event });
    } catch {
      // Ignore malformed messages
    }
  };

  ws.onclose = () => {
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  }, backoff);
}

function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  ws?.close();
  ws = null;
  backoff = INITIAL_BACKOFF_MS;
}

// --- SharedWorker lifecycle ---

// The tsconfig includes "DOM" but not "WebWorker", so self is typed as
// Window & typeof globalThis.  Cast to the worker scope we actually run in.
interface SharedWorkerGlobalScope extends WorkerGlobalScope {
  onconnect: ((this: SharedWorkerGlobalScope, ev: MessageEvent) => unknown) | null;
}
const workerSelf = self as unknown as SharedWorkerGlobalScope;

workerSelf.onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  if (!port) return;

  ports.add(port);

  // If this is the first tab, open the connection
  if (ports.size === 1) {
    connect();
  }

  port.onmessage = (msg: MessageEvent) => {
    const data = msg.data as { type: string; payload?: unknown };

    switch (data.type) {
      case 'send': {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(data.payload));
        }
        break;
      }
      // 'ready' is acknowledged implicitly — the port starts receiving events
    }
  };

  // Close handler: remove port and disconnect WS if no tabs remain
  port.addEventListener(
    'close',
    () => {
      ports.delete(port);
      if (ports.size === 0) {
        disconnect();
      }
    },
    { once: true },
  );

  // Start the port so it can receive messages
  port.start();
};
