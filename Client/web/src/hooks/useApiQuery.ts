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
 */
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
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
          // Offline: silent success → 用 defaultData, queryFn 视为成功
          // page 不会进 isError 分支, 继续渲染 (data 是 defaultData, 可结合 IDB 数据)
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
    // OFFLINE 视为非 error (silent success), 业务 4xx 才是 error
    isError: q.isError && !isOffline,
    error: isOffline ? null : q.error,
    refetch: q.refetch,
    isOffline,
  };
}
