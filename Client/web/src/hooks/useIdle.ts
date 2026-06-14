import { useState, useEffect, useRef, useCallback } from 'react';

const DEFAULT_IDLE_MS = 30_000;

/**
 * Detects user idle state: no mousemove / keydown / scroll for `timeout` ms.
 * Returns `true` when the user is considered idle.
 */
export function useIdle(timeout: number = DEFAULT_IDLE_MS): boolean {
  const [idle, setIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setIdle(false);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIdle(true), timeout);
  }, [timeout]);

  useEffect(() => {
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'scroll'];
    events.forEach((evt) => window.addEventListener(evt, reset, { passive: true }));

    // Start initial timer
    timerRef.current = setTimeout(() => setIdle(true), timeout);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, reset));
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [reset, timeout]);

  return idle;
}
