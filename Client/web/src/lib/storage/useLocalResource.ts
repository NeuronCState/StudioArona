/**
 * useLocalResource — 通用「本地优先 + online 同步 server」resource hook
 *
 * 模式 (用户拍板 2026-06-16):
 * - 桌面 (.dmg) + 浏览器 (Web): 都先写本地 (Tauri fs / IDB), online 时后台 push server
 * - 离线: 数据只在本地, 走 storage adapter 拿
 * - 在线 + 数据中心: 后台静默 sync, 启动先 listAll 本地 + 同时 fetch server 覆盖
 *
 * 7 页面 (feeds/memory/schedule/skills/admin/system/shared) 复用此 hook:
 *
 *   const { data, save, remove, sync } = useLocalResource<ScheduleEvent>({
 *     table: 'schedules',
 *     serverList: () => api.get('/schedules'),
 *   });
 *
 *   await save({ id: 'abc', title: '...', ... }); // 写本地 + online push server
 *   await remove('abc');
 *   await sync(); // 重新从 server 拉 + 覆盖本地
 *
 * SchedulePage 已经接通, 其他 6 页面 follow 同 pattern
 * (feeds/memory/skills/admin/system/shared 走 server-only 阶段, 留到 1-7 之后)
 */
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import * as storage from './index';
import { useConnectionStore } from '@/stores/connection';

export interface LocalResourceConfig<T extends { id: string; serverId?: string | null; dirty?: boolean; updatedAt?: number }> {
  /** Dexie/storage table 名 (storage adapter 自动 dispatch Tauri fs / IDB) */
  table: storage.Table;
  /** React Query key — 跟其他 queryClient.invalidate 联动 */
  queryKey: readonly unknown[];
  /** 从 server 拉数据 — 失败 (离线/未连接) 不报错 */
  serverList: () => Promise<T[]>;
  /** 推到 server — 返回新生成的服务端 id */
  serverPush?: (doc: T) => Promise<T>;
  /** 从 server 删 */
  serverRemove?: (id: string) => Promise<void>;
}

export function useLocalResource<
  T extends { id: string; serverId?: string | null; dirty?: boolean; updatedAt?: number },
>(config: LocalResourceConfig<T>): {
  data: T[] | undefined;
  query: UseQueryResult<T[]>;
  save: (doc: T) => Promise<T>;
  remove: (id: string) => Promise<void>;
  sync: () => Promise<void>;
} {
  const { table, queryKey, serverList, serverPush, serverRemove } = config;
  const queryClient = useQueryClient();
  const effectiveMode = useConnectionStore((s) => s.effectiveMode());
  const online = effectiveMode === 'online';

  const query = useQuery<T[]>({
    queryKey,
    queryFn: async () => {
      // 1. 本地先出 — 用户能立即看到数据
      const local = await storage.listAll<T>(table);
      if (local.length > 0) {
        // 后台 sync server, 拉新覆盖 (不 await, 避免 UI 卡)
        if (online) {
          serverList()
            .then(async (remote) => {
              await storage.clear(table);
              for (const r of remote) await storage.put(table, r as unknown as Record<string, unknown>);
              queryClient.setQueryData<T[]>(queryKey, remote);
            })
            .catch(() => {
              /* offline, keep local */
            });
        }
        return local;
      }
      // 2. 本地空 — 直接拉 server
      if (online) {
        const remote = await serverList();
        for (const r of remote) await storage.put(table, r as unknown as Record<string, unknown>);
        return remote;
      }
      // 3. 离线 + 本地空 — 返空数组, UI 显示 EmptyState
      return [];
    },
    staleTime: 30_000,
  });

  // 启动时 (online) 拉一次 server — 不用等 queryFn 走本地分支
  useEffect(() => {
    if (!online) return;
    serverList()
      .then(async (remote) => {
        await storage.clear(table);
        for (const r of remote) await storage.put(table, r as unknown as Record<string, unknown>);
        queryClient.setQueryData<T[]>(queryKey, remote);
      })
      .catch(() => {});
  }, [online, table, queryClient, serverList, queryKey]);

  const save = useCallback(
    async (doc: T): Promise<T> => {
      const stamped: T = { ...doc, updatedAt: Date.now(), dirty: !online };
      await storage.put(table, stamped as unknown as Record<string, unknown>);
      if (online && serverPush) {
        try {
          const synced = await serverPush(doc);
          const clean: T = { ...synced, serverId: synced.id, dirty: false, updatedAt: Date.now() };
          await storage.put(table, clean as unknown as Record<string, unknown>);
          queryClient.invalidateQueries({ queryKey });
          return clean;
        } catch {
          /* 网络挂了, dirty=true 留给下次 sync */
        }
      } else {
        queryClient.invalidateQueries({ queryKey });
        return stamped;
      }
      return stamped;
    },
    [online, table, serverPush, queryClient, queryKey],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await storage.del(table, id);
      if (online && serverRemove) {
        try {
          await serverRemove(id);
        } catch {
          /* dirty 留给 sync */
        }
      }
      queryClient.invalidateQueries({ queryKey });
    },
    [online, table, serverRemove, queryClient, queryKey],
  );

  const sync = useCallback(async (): Promise<void> => {
    if (!online) return;
    const remote = await serverList();
    await storage.clear(table);
    for (const r of remote) await storage.put(table, r as unknown as Record<string, unknown>);
    queryClient.setQueryData<T[]>(queryKey, remote);
  }, [online, table, serverList, queryClient, queryKey]);

  return {
    data: query.data,
    query,
    save,
    remove,
    sync,
  };
}
