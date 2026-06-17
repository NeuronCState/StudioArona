/**
 * useApiQuery — 包装 React Query useQuery, 加 offline 兜底.
 *
 * 行为:
 * - queryFn 抛 ApiError('OFFLINE') → 进 isError=false, data=空值 (不显示 "Internal Server Error")
 * - 业务 error (4xx) → 仍进 isError=true, 正常显示
 * - offline state 写到 useConnectionStore, 各 page 共享
 *
 * 用法:
 *   const { data, isPending, refetch } = useApiQuery({
 *     queryKey: ['feeds'],
 *     path: '/feeds',
 *     defaultData: [] as Feed[],
 *   });
 */
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api/client';

interface UseApiQueryOptions<T> {
  queryKey: UseQueryOptions<T>['queryKey'];
  path: string;
  defaultData: T;
  staleTime?: number;
  gcTime?: number;
  enabled?: boolean;
}

export function useApiQuery<T>(opts: UseApiQueryOptions<T>) {
  const q = useQuery<T>({
    queryKey: opts.queryKey,
    queryFn: async (): Promise<T> => {
      try {
        return await api.get<T>(opts.path);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'OFFLINE') {
          // Offline: silent fail → 用 defaultData, 不进 error
          return opts.defaultData;
        }
        throw e;
      }
    },
    staleTime: opts.staleTime ?? 60_000,
    gcTime: opts.gcTime,
    enabled: opts.enabled,
  });

  return {
    data: q.data ?? opts.defaultData,
    isPending: q.isPending,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
    isOffline: q.error instanceof ApiError && q.error.code === 'OFFLINE',
  };
}