/**
 * Performance hooks barrel export.
 *
 * All animation/visibility/idle hooks available from `@/hooks`.
 * Engineers A and B should import from here — do NOT re-implement.
 *
 * Usage:
 *   import { useVisibility, useReducedMotion } from '@/hooks';
 */

export { useReducedMotion } from './useReducedMotion';
export { useVisibility } from './useVisibility';
export { useIdle } from './useIdle';
export { useThrottle } from './useThrottle';
export { useVirtualList } from './useVirtualList';
