import { useEffect, useRef } from 'react';
import { useConnectionStore } from '@/stores/connection';

const CENTER_URL = import.meta.env.VITE_CENTER_URL || 'http://127.0.0.1:8080';
const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS = 3_000;

/**
 * Subscribe to server connection status via /health ping.
 *
 * Place once at app root. Polls every 30s, marks server 'offline' if 2 consecutive misses.
 * Replaces the v2 EventSource-based version (which pointed at port 18790, removed in v3).
 */
export function useConnectionStatus() {
  const setServerStatus = useConnectionStore((s) => s.setServerStatus);
  const stopRef = useRef(false);
  const failCountRef = useRef(0);

  useEffect(() => {
    stopRef.current = false;
    failCountRef.current = 0;

    async function ping(): Promise<void> {
      if (stopRef.current) return;
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
        const r = await fetch(`${CENTER_URL}/health`, { signal: ctrl.signal });
        clearTimeout(tid);
        if (r.ok) {
          failCountRef.current = 0;
          setServerStatus('online');
        } else {
          failCountRef.current += 1;
          if (failCountRef.current >= 2) setServerStatus('offline');
        }
      } catch {
        // Network error: server not reachable
        failCountRef.current += 1;
        if (failCountRef.current >= 2) setServerStatus('offline');
      }
    }

    // initial ping, then poll
    ping();
    const id = setInterval(ping, PING_INTERVAL_MS);

    return () => {
      stopRef.current = true;
      clearInterval(id);
    };
  }, [setServerStatus]);
}