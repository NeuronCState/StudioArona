import { QueryClient, keepPreviousData } from '@tanstack/react-query';

/**
 * Shared QueryClient factory with performance-tuned defaults.
 *
 * - staleTime: 30s — data is fresh for 30 seconds, reducing refetch noise
 * - gcTime: 5min — inactive cache entries survive tab switches
 * - retry: 1 — single retry on failure, avoiding thundering-herd retries
 * - placeholderData: keepPreviousData — keep showing old data while refetching.
 *   This is the key fix for "页面切换闪烁 skeleton" — without it, every tab switch
 *   re-mounts the page, useQuery returns isLoading=true, and the page briefly shows
 *   skeleton/empty before real data lands. With keepPreviousData, the previous
 *   page's data stays visible until the new fetch resolves.
 * - refetchOnWindowFocus: 'always' — ensure visibility-to-foreground always refetches
 * - networkMode: 'offlineFirst' — serve cached data even when offline
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: 'always',
        networkMode: 'offlineFirst',
        placeholderData: keepPreviousData,
      },
    },
  });
}
