/**
 * useApiQuery — 包装 React Query useQuery, 加 offline 兜底.
 *
 * 行为:
 * - queryFn 抛 ApiError('OFFLINE') → silent success: data=defaultData, isError=false, isOffline=true
 *   这样 page 不会进 error 分支, 继续渲染 (data 是 defaultData 或 IDB 数据)
 * - 业务 error (4xx) → 仍进 isError=true, 正常显示 CardError
 * - offline state 写到 useConnectionStore, 各 page 共享
 *
 * 用法:
 *   const { data, isPending, refetch, isOffline } = useApiQuery({
 *     queryKey: ['feeds'],
 *     path: '/feeds',
 *     defaultData: [] as Feed[],
 *   });
 *
 * React Query 5 queryOptions() factory:
 *   const opts = apiQueryOptions<Feed[]>('/feeds', ['feeds']);
 *   const { data } = useSuspenseQuery(opts);  // or useQuery(opts)
 */
import {
  useQuery,
  queryOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api/client";
import { useConnectionStore } from "@/stores/connection";

interface UseApiQueryOptions<T> {
  queryKey: UseQueryOptions<T>["queryKey"];
  path: string;
  defaultData: T;
  staleTime?: number;
  gcTime?: number;
  enabled?: boolean;
}

export function useApiQuery<T>(opts: UseApiQueryOptions<T>) {
  const isOffline = useConnectionStore(
    (state) => state.effectiveMode() !== "online",
  );
  const q = useQuery<T>({
    queryKey: opts.queryKey,
    queryFn: async (): Promise<T> => {
      try {
        return await api.get<T>(opts.path);
      } catch (e) {
        if (e instanceof ApiError && e.code === "OFFLINE") {
          return opts.defaultData;
        }
        throw e;
      }
    },
    staleTime: opts.staleTime ?? 60_000,
    gcTime: opts.gcTime,
    enabled: (opts.enabled ?? true) && !isOffline,
  });

  return {
    data: q.data ?? opts.defaultData,
    isPending: q.isPending && !isOffline,
    isError: q.isError && !isOffline,
    error: isOffline ? null : q.error,
    refetch: q.refetch,
    isOffline,
  };
}

/**
 * React Query 5 queryOptions() factory — 类型安全的 query 配置, 可复用于
 * `useQuery`, `useSuspenseQuery`, `queryClient.prefetchQuery` 等。
 *
 * 不含 offline 兜底 (由 useApiQuery 负责)。适合 server-dependent 页面。
 *
 * Usage:
 *   const opts = apiQueryOptions<SystemMetrics>('/system/metrics', ['system-metrics']);
 *   const { data } = useSuspenseQuery(opts);
 */
export function apiQueryOptions<T>(
  path: string,
  queryKey: readonly unknown[],
  opts?: { staleTime?: number },
) {
  return queryOptions({
    queryKey,
    queryFn: () => api.get<T>(path),
    staleTime: opts?.staleTime ?? 60_000,
  });
}
