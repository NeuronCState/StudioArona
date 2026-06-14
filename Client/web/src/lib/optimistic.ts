import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Apply an optimistic update to a query's cached data.
 *
 * The `updater` receives the current cached data (or undefined) and must return
 * the optimistically-updated value. If the mutation fails, the consumer is
 * responsible for rolling back by calling `queryClient.invalidateQueries` or
 * `queryClient.setQueryData` with the previous snapshot.
 *
 * Returns a "snapshot" — the previous data — so callers can restore it on error.
 *
 * @example
 * const previous = optimisticUpdate(queryClient, ['todos'], (old) =>
 *   [...(old ?? []), newTodo]
 * );
 * try { await addTodo(newTodo); }
 * catch { queryClient.setQueryData(['todos'], previous); }
 */
export function optimisticUpdate<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  updater: (old: T | undefined) => T,
): T | undefined {
  const previous = queryClient.getQueryData<T>(queryKey);
  queryClient.setQueryData<T>(queryKey, updater(previous));
  return previous;
}

/**
 * Create an onMutate callback (for useMutation) that performs an optimistic
 * update and returns a rollback context for onError.
 *
 * @example
 * useMutation({
 *   mutationFn: addTodo,
 *   onMutate: optimisticMutate(queryClient, ['todos'], (old, newTodo) =>
 *     [...(old ?? []), newTodo]
 *   ),
 *   onError: (_err, _vars, ctx) => rollbackOptimistic(queryClient, ['todos'], ctx),
 * });
 */
export function optimisticMutate<T, V>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  updater: (old: T | undefined, variables: V) => T,
): (variables: V) => { previous: T | undefined } {
  return (variables: V) => {
    const previous = optimisticUpdate(queryClient, queryKey, (old: T | undefined) =>
      updater(old, variables),
    );
    return { previous };
  };
}

/**
 * Roll back an optimistic update by restoring previous data.
 * Pass the context returned by `optimisticMutate` onMutate.
 */
export function rollbackOptimistic<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  context: { previous: T | undefined } | undefined,
): void {
  if (context?.previous !== undefined) {
    queryClient.setQueryData(queryKey, context.previous);
  } else {
    queryClient.invalidateQueries({ queryKey });
  }
}
