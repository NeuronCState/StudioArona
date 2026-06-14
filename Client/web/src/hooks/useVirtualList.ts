/**
 * Virtual list hook — render only visible items in long lists.
 *
 * TODO: Install @tanstack/react-virtual and replace this placeholder with a
 * fully-typed wrapper. The package is the standard choice for TanStack-based
 * projects and integrates directly with React.
 *
 *   pnpm add @tanstack/react-virtual
 *
 * Once installed, this hook should wrap useVirtualizer and return:
 *   - containerRef
 *   - totalSize / virtualItems / scrollToIndex / getItemKey
 *
 * Until then, callers should use a simple .slice() pagination or render all
 * items with overflow-scroll (acceptable for < 500 rows).
 */

export function useVirtualList<T>(_items: T[], _options?: { estimateSize?: number }) {
  // placeholder — install @tanstack/react-virtual to enable
  return {
    containerRef: null,
    totalSize: 0,
    virtualItems: [] as { index: number; start: number; size: number }[],
    scrollToIndex: (_index: number) => {
      /* noop */
    },
    getItemKey: (index: number) => index,
  };
}
