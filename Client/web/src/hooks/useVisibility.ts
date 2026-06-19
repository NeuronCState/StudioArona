import { useState, useEffect } from "react";

/**
 * Tracks whether the browser tab is currently visible.
 * Returns `false` when the tab is hidden (background / minimised).
 */
export function useVisibility(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document !== "undefined" ? !document.hidden : true,
  );

  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return visible;
}
