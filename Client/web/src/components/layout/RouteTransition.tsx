import { useLocation } from "react-router-dom";
import type { ReactNode } from "react";

/**
 * Lightweight route transition using key-based remount + CSS animation.
 *
 * When the pathname changes, React unmounts the old subtree and mounts
 * a new one because the `key` prop changes. The freshly-mounted element
 * plays the `.route-stage` enter animation defined in animations.css.
 *
 * This avoids the react-transition-group dependency while still providing
 * a smooth enter animation on every route change.
 *
 * A uses this by wrapping <main>{children}</main> inside App.tsx or AppShell.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div key={pathname} className="route-stage">
      {children}
    </div>
  );
}
