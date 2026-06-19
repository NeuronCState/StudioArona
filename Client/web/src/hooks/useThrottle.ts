import { useRef, useEffect, useCallback } from "react";

/**
 * Returns a throttled version of the callback that fires at most once per `delay` ms.
 * Uses leading-edge behaviour by default (fires immediately on first call).
 */
export function useThrottle<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  delay: number,
  leading = true,
): (...args: TArgs) => void {
  const lastRun = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    return () => {
      if (timeout.current !== null) clearTimeout(timeout.current);
    };
  }, []);

  return useCallback(
    (...args: TArgs) => {
      const now = Date.now();

      if (lastRun.current === 0 && !leading) {
        lastRun.current = now;
      }

      if (now - lastRun.current >= delay) {
        lastRun.current = now;
        cbRef.current(...args);
      } else if (timeout.current === null) {
        timeout.current = setTimeout(
          () => {
            lastRun.current = Date.now();
            timeout.current = null;
            cbRef.current(...args);
          },
          delay - (now - lastRun.current),
        );
      }
    },
    [delay, leading],
  );
}
