import { type ReactElement } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Home page ambient backdrop.
 * Replaces the three expensive blur-3xl + backdrop-blur-xl divs
 * with a single compositor-only transform animation layered over a
 * pre-rendered WebP texture (or CSS gradient fallback).
 *
 * The animation is `transform`-only — runs on the compositor thread
 * with zero main-thread cost.
 */
export function HomeAmbient(): ReactElement {
  const reduced = useReducedMotion();

  // TODO: Replace CSS gradient with pre-rendered WebP textures
  //       (needs Figma export of 256x256 greyscale gaussian blur:
  //        /assets/textures/home-ambient-day.webp
  //        /assets/textures/home-ambient-night.webp)
  //       For now use a pure CSS radial gradient as a light placeholder.
  const gradient =
    "radial-gradient(ellipse 80% 60% at 20% 30%, rgba(103,215,255,0.10) 0%, transparent 50%), " +
    "radial-gradient(ellipse 60% 80% at 80% 60%, rgba(168,184,255,0.08) 0%, transparent 50%), " +
    "radial-gradient(ellipse 70% 50% at 50% 90%, rgba(75,163,255,0.06) 0%, transparent 50%)";

  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 will-change-transform"
      style={{
        background: gradient,
        animation: reduced
          ? "none"
          : "home-ambient-drift 30s ease-in-out infinite alternate",
      }}
      aria-hidden="true"
    />
  );
}
