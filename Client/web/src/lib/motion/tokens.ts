/**
 * JS-side mirror of the CSS motion tokens in tokens.css.
 * Use these in Web Animations API, spring calculations, and imperative animations.
 */

/** Duration scale (ms) */
export const DURATION = {
  instant: 0,
  fast: 120,
  base: 240,
  slow: 400,
  extra: 600,
} as const;

/** Easing curve control points [x1, y1, x2, y2] */
export const EASING = {
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
  outSoft: [0.22, 1, 0.36, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
  in: [0.7, 0, 1, 0.5] as [number, number, number, number],
  elastic: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
} as const;

/** Convert cubic-bezier array to CSS string */
export function bezierCSS(
  points: readonly [number, number, number, number],
): string {
  return `cubic-bezier(${points.join(",")})`;
}

/** Create a Web Animations API timing object from tokens */
export function timing(
  duration: number,
  easing: readonly [number, number, number, number],
): KeyframeAnimationOptions {
  return {
    duration,
    easing: bezierCSS(easing),
    fill: "both",
  };
}
