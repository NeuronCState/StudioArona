import { useEffect, useRef } from 'react';
import { useConnectionStore } from '@/stores/connection';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:18790';

/**
 * Subscribe to connection status via SSE and initial REST fetch.
 * Place once at app root.
 */
export function useConnectionStatus() {
  const setServerStatus = useConnectionStore((s) => s.setServerStatus);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;

    function connect() {
      if (stopped) return;
      es = new EventSource(`${BRIDGE_URL}/api/ui/stream`);

      // Initial status fetch
      fetch(`${BRIDGE_URL}/api/connection/status`)
        .then((r) => r.json())
        .then((d) => setServerStatus(d.status))
        .catch(() => {});

      es.addEventListener('connection_status', (e) => {
        try {
          const { status } = JSON.parse(e.data);
          setServerStatus(status);
        } catch {}
      });

      es.onerror = () => {
        es?.close();
        if (!stopped) {
          reconnectRef.current = setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      stopped = true;
      es?.close();
      clearTimeout(reconnectRef.current);
    };
  }, [setServerStatus]);
}
