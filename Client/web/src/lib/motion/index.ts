/**
 * @file apps/web/src/lib/motion/index.ts
 * Barrel export for the motion system.
 * Engineer A imports from '@/' or this module to use:
 *   - FLIP animation helpers (flipMorph, flipReplace)
 *   - Timing primitives (DURATION, EASING, bezierCSS, timing)
 */

export { flipMorph, flipReplace } from "./flip";
export { DURATION, EASING, bezierCSS, timing } from "./tokens";
