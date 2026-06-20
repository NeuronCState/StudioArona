/**
 * useReactiveLocal — Dexie 4 liveQuery() + react-query 混合方案。
 *
 * 背景: react-query 可以轮询 + 缓存, 但对于跨 tab 的 IDB 变更感知弱。
 * Dexie 4 的 liveQuery() 原生订阅 IndexedDB 变更, 适合:
 *   1. 多 tab 协同 — tab A 写入后 tab B 即时看到
 *   2. 后台数据同步 — IDB 被 service worker 更新时自动刷新
 *   3. 去轮询 — 完全 event-driven, 省 CPU
 *
 * 用法:
 *   const feeds = useReactiveLocal(() => db.feeds.toArray(), []);
 *   // feeds 随 IDB 变更自动刷新, 无需 refetchInterval
 *
 * 注意: Tauri 桌面端走 FS 存储, liveQuery 不适用 (回退到 useLocalResource)。
 */
import { useLiveQuery } from "dexie-react-hooks";
import { isTauri } from "./platform";
import { useRef } from "react";

/**
 * 响应式本地查询 — Dexie liveQuery 包装。
 *
 * 仅在 Web 端生效 (IndexedDB)。Tauri 桌面端返回 null, 调用方应
 * 回退到 useLocalResource。
 *
 * @param querier 返回 Dexie promise 的函数 (如 () => db.feeds.toArray())
 * @param deps    querier 内部引用的外部变量 (react 依赖数组)
 * @returns       查询结果数组, loading 时返回 undefined
 */
export function useReactiveLocal<T>(
  querier: () => Promise<T[]>,
  deps: unknown[] = [],
): T[] | undefined {
  // Tauri 桌面端: FS 存储, liveQuery 无用
  const tauri = useRef(isTauri()).current;
  if (tauri) return undefined;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useLiveQuery(querier, deps);
}

/**
 * 检测是否支持 liveQuery: Web 端 true, Tauri 桌面端 false。
 * 用于运行时判断是否启用响应式查询。
 */
export function supportsLiveQuery(): boolean {
  return !isTauri();
}
