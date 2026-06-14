import type { WSEvent } from '@/types/ws-events';

type Handler = (event: WSEvent) => void;
type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

function supportsSharedWorker(): boolean {
  try {
    return typeof SharedWorker !== 'undefined';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// SharedWorker transport
// ---------------------------------------------------------------------------

class SharedWorkerTransport {
  private worker: SharedWorker | null = null;
  private port: MessagePort | null = null;
  private handlers = new Set<Handler>();
  private started = false;

  connect(): void {
    if (this.started) return;

    try {
      this.worker = new SharedWorker(
        new URL('@/workers/ws-shared-worker.ts', import.meta.url),
        { type: 'module', name: 'javis-ws-shared' },
      );
      this.port = this.worker.port;

      this.port.onmessage = (e: MessageEvent) => {
        const data = e.data as { type: string; event?: WSEvent };
        if (data.type === 'event' && data.event) {
          this.handlers.forEach((h) => h(data.event!));
        }
      };

      this.port.start();
      this.started = true;
    } catch {
      // SharedWorker construction failed — caller should fall back to direct WS
      throw new Error('SharedWorker unavailable');
    }
  }

  disconnect(): void {
    this.worker = null;
    this.port = null;
    this.started = false;
  }

  subscribe(handler: Handler): Unsubscribe {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  send(event: WSEvent): void {
    if (this.port) {
      this.port.postMessage({ type: 'send', payload: event });
    }
  }

  get connected(): boolean {
    return this.started;
  }
}

// ---------------------------------------------------------------------------
// Direct WebSocket transport (fallback)
// ---------------------------------------------------------------------------

class DirectWSTransport {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = 1_000;
  private static readonly MAX_BACKOFF = 30_000;

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      this.ws = new WebSocket(`${protocol}//${window.location.host}/ws/events`);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.backoff = 1_000;
    };

    this.ws.onmessage = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data as string) as WSEvent;
        this.handlers.forEach((h) => h(event));
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.backoff = 1_000;
  }

  subscribe(handler: Handler): Unsubscribe {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  send(event: WSEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
      this.backoff = Math.min(this.backoff * 2, DirectWSTransport.MAX_BACKOFF);
    }, this.backoff);
  }
}

// ---------------------------------------------------------------------------
// EventBus — picks transport automatically
// ---------------------------------------------------------------------------

class EventBus {
  private transport: SharedWorkerTransport | DirectWSTransport | null = null;
  private readonly sharedWorkerSupported: boolean;

  constructor() {
    this.sharedWorkerSupported = supportsSharedWorker();
  }

  connect(): void {
    if (this.transport) return;

    if (this.sharedWorkerSupported) {
      try {
        this.transport = new SharedWorkerTransport();
        this.transport.connect();
        return;
      } catch {
        // SharedWorker init failed — fall through to direct WS
      }
    }

    this.transport = new DirectWSTransport();
    this.transport.connect();
  }

  disconnect(): void {
    this.transport?.disconnect();
    this.transport = null;
  }

  subscribe(handler: Handler): Unsubscribe {
    if (!this.transport) {
      this.connect();
    }
    return this.transport!.subscribe(handler);
  }

  send(event: WSEvent): void {
    this.transport?.send(event);
  }
}

export const eventBus = new EventBus();
