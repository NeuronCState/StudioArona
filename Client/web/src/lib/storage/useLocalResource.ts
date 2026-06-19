/**
 * Shared local-first resource hook.
 *
 * Local writes are durable first. Remote reconciliation preserves pending
 * writes and delete tombstones instead of replacing the whole local table.
 */
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useConnectionStore } from "@/stores/connection";
import * as storage from "./index";

export interface LocalResourceDocument {
  id: string;
  serverId?: string | null;
  dirty?: boolean;
  updatedAt?: number;
  deletedAt?: number | null;
}

export interface LocalResourceConfig<T extends LocalResourceDocument> {
  table: storage.Table;
  queryKey: readonly unknown[];
  serverList: () => Promise<T[]>;
  serverPush?: (doc: T) => Promise<T>;
  serverRemove?: (id: string) => Promise<void>;
  onPushError?: (doc: T, error: unknown) => void;
  refetchInterval?: number | false;
}

function remoteId(doc: LocalResourceDocument): string {
  return doc.serverId ?? doc.id;
}

function visible<T extends LocalResourceDocument>(docs: T[]): T[] {
  return docs.filter((doc) => !doc.deletedAt);
}

async function reconcileRemote<T extends LocalResourceDocument>(
  table: storage.Table,
  remote: T[],
  canWrite: () => boolean = () => true,
): Promise<T[]> {
  const local = await storage.listAll<T>(table);
  const localByRemoteId = new Map(local.map((doc) => [remoteId(doc), doc]));
  const remoteIds = new Set(remote.map((doc) => remoteId(doc)));

  for (const remoteDoc of remote) {
    if (!canWrite()) return visible(await storage.listAll<T>(table));
    const id = remoteId(remoteDoc);
    const localDoc = localByRemoteId.get(id);
    if (localDoc?.dirty) continue;

    const clean = {
      ...remoteDoc,
      serverId: remoteDoc.serverId ?? remoteDoc.id,
      dirty: false,
      deletedAt: null,
    } as T;
    if (localDoc && localDoc.id !== clean.id)
      await storage.del(table, localDoc.id);
    await storage.put(table, clean as unknown as Record<string, unknown>);
  }

  for (const localDoc of local) {
    if (!canWrite()) return visible(await storage.listAll<T>(table));
    if (!localDoc.dirty && !remoteIds.has(remoteId(localDoc))) {
      await storage.del(table, localDoc.id);
    }
  }

  return visible(await storage.listAll<T>(table));
}

export function useLocalResource<T extends LocalResourceDocument>(
  config: LocalResourceConfig<T>,
): {
  data: T[] | undefined;
  query: UseQueryResult<T[]>;
  save: (doc: T) => Promise<T>;
  remove: (id: string) => Promise<void>;
  sync: () => Promise<void>;
  isOffline: boolean;
} {
  const configRef = useRef(config);
  configRef.current = config;
  const pushesRef = useRef(new Map<string, Promise<T>>());
  const mutationVersionRef = useRef(0);

  const queryClient = useQueryClient();
  const online = useConnectionStore(
    (state) => state.effectiveMode() === "online",
  );

  const setVisibleData = useCallback(
    (docs: T[]) =>
      queryClient.setQueryData<T[]>(configRef.current.queryKey, visible(docs)),
    [queryClient],
  );

  const pushDocument = useCallback((doc: T): Promise<T> => {
    const existing = pushesRef.current.get(doc.id);
    if (existing) return existing;

    const operation = (async () => {
      const { table, serverPush, onPushError } = configRef.current;
      if (!serverPush) return doc;
      try {
        const synced = await serverPush(doc);
        const clean = {
          ...synced,
          serverId: synced.serverId ?? synced.id,
          dirty: false,
          deletedAt: null,
          updatedAt: Date.now(),
        } as T;
        if (clean.id !== doc.id) await storage.del(table, doc.id);
        await storage.put(table, clean as unknown as Record<string, unknown>);
        return clean;
      } catch (error) {
        onPushError?.(doc, error);
        return doc;
      } finally {
        pushesRef.current.delete(doc.id);
      }
    })();
    pushesRef.current.set(doc.id, operation);
    return operation;
  }, []);

  const pushPending = useCallback(
    async (snapshot?: T[]): Promise<void> => {
      const { table, serverPush, serverRemove } = configRef.current;
      const pending = (snapshot ?? (await storage.listAll<T>(table))).filter(
        (doc) => doc.dirty,
      );

      for (const doc of pending) {
        if (doc.deletedAt) {
          if (!serverRemove) continue;
          try {
            await serverRemove(remoteId(doc));
            await storage.del(table, doc.id);
          } catch {
            // Keep the tombstone for the next sync.
          }
          continue;
        }

        if (!serverPush) continue;
        await pushDocument(doc);
      }
    },
    [pushDocument],
  );

  const pullRemote = useCallback(
    async (localSnapshot?: T[]): Promise<T[]> => {
      const { table, serverList } = configRef.current;
      if (online) await pushPending(localSnapshot);
      const remote = await serverList();
      const versionBeforeMerge = mutationVersionRef.current;
      const merged = await reconcileRemote(
        table,
        remote,
        () => mutationVersionRef.current === versionBeforeMerge,
      );
      if (mutationVersionRef.current !== versionBeforeMerge) {
        return visible(await storage.listAll<T>(table));
      }
      return merged;
    },
    [online, pushPending],
  );

  const query = useQuery<T[]>({
    queryKey: config.queryKey,
    queryFn: async () => {
      const local = visible(await storage.listAll<T>(configRef.current.table));
      if (!online) return local;

      if (local.length === 0) return pullRemote(local);

      const versionBeforePull = mutationVersionRef.current;
      void pullRemote(local)
        .then((remote) => {
          if (mutationVersionRef.current === versionBeforePull)
            setVisibleData(remote);
        })
        .catch(() => {
          // Keep rendering the durable local snapshot.
        });
      return local;
    },
    staleTime: 30_000,
    refetchInterval: config.refetchInterval,
  });

  const save = useCallback(
    async (doc: T): Promise<T> => {
      mutationVersionRef.current += 1;
      const { table, queryKey, serverPush } = configRef.current;
      const pending = {
        ...doc,
        dirty: Boolean(serverPush),
        deletedAt: null,
        updatedAt: Date.now(),
      } as T;
      await storage.put(table, pending as unknown as Record<string, unknown>);
      queryClient.setQueryData<T[]>(queryKey, (current = []) =>
        visible([...current.filter((item) => item.id !== pending.id), pending]),
      );

      if (!online || !serverPush) return pending;

      const synced = await pushDocument(pending);
      if (!synced.dirty) {
        queryClient.setQueryData<T[]>(queryKey, (current = []) =>
          visible([
            ...current.filter((item) => item.id !== pending.id),
            synced,
          ]),
        );
      }
      return synced;
    },
    [online, pushDocument, queryClient],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      mutationVersionRef.current += 1;
      const { table, queryKey, serverRemove } = configRef.current;
      const existing = await storage.get<T>(table, id);
      queryClient.setQueryData<T[]>(queryKey, (current = []) =>
        current.filter((item) => item.id !== id),
      );

      if (!serverRemove) {
        await storage.del(table, id);
        return;
      }

      const tombstone = {
        ...(existing ?? ({ id } as T)),
        id,
        serverId: existing?.serverId ?? id,
        dirty: true,
        deletedAt: Date.now(),
        updatedAt: Date.now(),
      } as T;
      await storage.put(table, tombstone as unknown as Record<string, unknown>);

      if (!online) return;
      try {
        await serverRemove(remoteId(tombstone));
        await storage.del(table, id);
      } catch {
        // Keep the tombstone for the next sync.
      }
    },
    [online, queryClient],
  );

  const sync = useCallback(async (): Promise<void> => {
    if (!online) return;
    setVisibleData(await pullRemote());
  }, [online, pullRemote, setVisibleData]);

  const wasOnlineRef = useRef(online);
  useEffect(() => {
    const reconnected = !wasOnlineRef.current && online;
    wasOnlineRef.current = online;
    if (reconnected) void sync();
  }, [online, sync]);

  return { data: query.data, query, save, remove, sync, isOffline: !online };
}
