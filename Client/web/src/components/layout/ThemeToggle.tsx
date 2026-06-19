import { useEffect, useRef, useCallback } from "react";
import { useThemeStore } from "@/hooks/useTheme";

function resolveTheme(theme: string): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const ref = useRef<HTMLDivElement>(null);

  const handleChange = useCallback(
    (e: Event) => {
      const detail = (e as CustomEvent).detail as "light" | "dark";
      setTheme(detail);
    },
    [setTheme],
  );

  useEffect(() => {
    const el = ref.current?.querySelector("theme-button");
    if (!el) return;
    el.addEventListener("change", handleChange);
    return () => el.removeEventListener("change", handleChange);
  }, [handleChange]);

  return (
    <div
      ref={ref}
      className="mx-auto mb-3 flex justify-center py-1"
      style={{ width: 187, height: 47 }}
    >
      <theme-button value={resolveTheme(theme)} size="2" />
    </div>
  );
}
