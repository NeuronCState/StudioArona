/**
 * Detect Tauri 运行环境
 *
 * - Tauri 2: window.__TAURI_INTERNALS__ 存在 (Tauri 2 后改名)
 * - 旧 Tauri 1: window.__TAURI__ 存在
 * - 浏览器: 都不存在
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return (
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__ ||
    !!(window as unknown as { __TAURI__?: unknown }).__TAURI__
  );
}
