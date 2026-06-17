/**
 * API + DB 适配层 — server-first, IDB 缓存
 *
 * 读: 优先返 IDB 缓存 (即时), 后台静默 sync server (best-effort)
 * 写: 先写 IDB (即时反馈), 标 dirty, 后台 push server
 *
 * 这层把 useQuery 跟 api.get/post 解耦, 让磁贴/页面只用 useQuery
 * 就能拿到本地优先 + 后台同步的行为
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { uuid, markDirty } from './index';
import type { LocalSchedule, LocalFeed, LocalFeedItem, LocalMemory, LocalSkill, LocalWeather, LocalSystemMetrics } from './index';
import { put as storagePut, get as storageGet, listAll as storageListAll, type Table } from '@/lib/storage';
import { api } from '@/lib/api/client';
import { useConnectionStore } from '@/stores/connection';

const SYNC_DEBOUNCE_MS = 1500;

/* ===== Schedule ===== */
export function useSchedules() {
  const sync = useSync();
  const q = useQuery({
    queryKey: ['schedules', 'local'],
    queryFn: async () => {
      const all = await storageListAll<LocalSchedule>('schedules');
      return all.filter(s => !s.deleted).sort((a, b) => a.startAt - b.startAt);
    },
  });
  useEffect(() => {
    sync('schedules', '/api/schedules', () => fetchServerSchedules());
  }, [sync]);
  return q;
}

async function fetchServerSchedules(): Promise<LocalSchedule[]> {
  const items = await api.get<Array<Record<string, unknown>>>('/api/schedules');
  return items.map(s => serverToLocal(s));
}

function serverToLocal(s: Record<string, unknown>): LocalSchedule {
  return {
    id: (s.id as string) ?? uuid(),
    serverId: s.id as string,
    title: (s.title as string) ?? '',
    description: s.description as string | undefined,
    startAt: new Date(s.start_at as string).getTime(),
    endAt: new Date(s.end_at as string).getTime(),
    location: s.location as string | undefined,
    visibility: ((s.visibility as string) ?? 'private') as LocalSchedule['visibility'],
    reminderMinutes: s.reminder_minutes as number | undefined,
    notified: (s.notified as boolean) ?? false,
    createdAt: s.created_at ? new Date(s.created_at as string).getTime() : Date.now(),
    updatedAt: s.updated_at ? new Date(s.updated_at as string).getTime() : Date.now(),
    syncedAt: Date.now(),
    dirty: false,
  };
}

/* ===== Feeds ===== */
export function useFeeds() {
  const sync = useSync();
  const q = useQuery({
    queryKey: ['feeds', 'local'],
    queryFn: async () => {
      const all = await storageListAll<LocalFeed>('feeds');
      return all.filter(f => !f.deleted).sort((a, b) => a.createdAt - b.createdAt);
    },
  });
  useEffect(() => {
    sync('feeds', '/api/feeds', () => fetchServerFeeds());
  }, [sync]);
  return q;
}

async function fetchServerFeeds(): Promise<LocalFeed[]> {
  const items = await api.get<Array<Record<string, unknown>>>('/api/feeds');
  return items.map(f => ({
    id: (f.id as string) ?? uuid(),
    serverId: f.id as string,
    url: (f.url as string) ?? '',
    title: f.title as string | undefined,
    source: f.source as string | undefined,
    priority: ((f.priority as string) ?? 'normal') as LocalFeed['priority'],
    enabled: (f.enabled as boolean) ?? true,
    createdAt: f.created_at ? new Date(f.created_at as string).getTime() : Date.now(),
    updatedAt: f.updated_at ? new Date(f.updated_at as string).getTime() : Date.now(),
    syncedAt: Date.now(),
    dirty: false,
  }));
}

export function useFeedItems(feedId: string | undefined) {
  return useQuery({
    queryKey: ['feedItems', feedId, 'local'],
    queryFn: async () => {
      if (!feedId) return [];
      const all = await storageListAll<LocalFeedItem>('feedItems');
      return all
        .filter(i => i.feedId === feedId && !i.deleted)
        .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
    },
    enabled: !!feedId,
  });
}

/* ===== Memory ===== */
export function useMemories() {
  const sync = useSync();
  const q = useQuery({
    queryKey: ['memories', 'local'],
    queryFn: async () => {
      const all = await storageListAll<LocalMemory>('memories');
      return all.filter(m => !m.deleted).sort((a, b) => b.createdAt - a.createdAt);
    },
  });
  useEffect(() => {
    sync('memories', '/api/memory/entries', async () => {
      // TODO: 实现 server memory fetch
      return [];
    });
  }, [sync]);
  return q;
}

/* ===== Skills ===== */
export function useSkills() {
  const sync = useSync();
  const q = useQuery({
    queryKey: ['skills', 'local'],
    queryFn: async () => {
      const all = await storageListAll<LocalSkill>('skills');
      return all.filter(s => !s.deleted);
    },
  });
  useEffect(() => {
    sync('skills', '/api/skills', async () => []);
  }, [sync]);
  return q;
}

/* ===== Weather (24h cache) ===== */
export function useWeather() {
  const sync = useSync();
  const q = useQuery({
    queryKey: ['weather', 'local'],
    queryFn: async () => {
      // weather 走 IDB 单独表 (key 为 'current', 24h 缓存)
      const all = await storageListAll<LocalWeather>('weather');
      const fresh = all.filter(w => Date.now() - w.updatedAt < 24 * 3600_000);
      return fresh[0] ?? null;
    },
  });
  useEffect(() => {
    sync('weather', '/api/weather?city=沈阳', async () => {
      const w = await api.get<Record<string, unknown>>('/api/weather?city=沈阳');
      const local: LocalWeather = {
        id: (w.city as string) ?? 'shenyang',
        city: (w.city as string) ?? '沈阳',
        temperature: (w.temperature as number) ?? 0,
        condition: (w.condition as string) ?? '',
        humidity: (w.humidity as number) ?? 0,
        windSpeed: `${w.windSpeed ?? 0} ${w.windDirection ?? ''}`.trim(),
        windDirection: (w.windDirection as string) ?? '',
        feelsLike: (w.feelsLike as number) ?? 0,
        uvIndex: `${w.uvIndex ?? 0}`,
        updatedAt: Date.now(),
      };
      return [local];
    });
  }, [sync]);
  return q;
}

/* ===== System metrics (5min cache) ===== */
export function useSystemMetrics() {
  const sync = useSync();
  const q = useQuery({
    queryKey: ['system', 'local'],
    queryFn: async () => {
      const all = await storageListAll<LocalSystemMetrics>('system');
      return all[0] ?? null;
    },
  });
  useEffect(() => {
    sync('system', '/api/system/metrics', async () => {
      const m = await api.get<Record<string, unknown>>('/api/system/metrics');
      const local: LocalSystemMetrics = {
        id: 'singleton',
        cpu: (m.cpu as number) ?? 0,
        memory: (m.memory as number) ?? 0,
        disk: (m.disk as number) ?? 0,
        networkIn: (m.networkIn as number) ?? 0,
        networkOut: (m.networkOut as number) ?? 0,
        vmsTotal: (m.vmsTotal as number) ?? 0,
        vmsRunning: (m.vmsRunning as number) ?? 0,
        updatedAt: Date.now(),
      };
      return [local];
    });
  }, [sync]);
  return q;
}

/* ===== Sync engine =====
 * 监听 useConnectionStore 状态, 在线时静默 sync
 * push: 本地 dirty → server
 * pull: server → 本地 (by serverId 匹配, 冲突 → manual merge dialog)
 */
function useSync() {
  const queryClient = useQueryClient();
  const effectiveMode = useConnectionStore(s => s.effectiveMode());
  const status = effectiveMode; // alias for readability
  const lastSync = useRef<Record<string, number>>({});

  return useCallback(
    async (key: string, _endpoint: string, fetcher: () => Promise<unknown[]>) => {
      // 防抖: 同 key 1.5s 内不重复
      const now = Date.now();
      if (lastSync.current[key] && now - lastSync.current[key] < SYNC_DEBOUNCE_MS) {
        return;
      }
      lastSync.current[key] = now;

      // 离线: 不打 server, 返 local cache (已经返了)
      if (status !== 'online') {
        return;
      }

      try {
        const serverItems = await fetcher();
        // 写 storage (按 serverId 匹配, IDB 或 Tauri fs 自动 dispatch)
        if (Array.isArray(serverItems)) {
          if ((key === 'weather' || key === 'system') && serverItems[0]) {
            await storagePut(key as 'weather' | 'system', serverItems[0] as Record<string, unknown>);
          } else {
            for (const item of serverItems as Array<{ id: string; serverId?: string; updatedAt: number }>) {
              if (item.serverId) {
                await storagePut(key as Table, item as Record<string, unknown>);
              }
            }
          }
          queryClient.invalidateQueries({ queryKey: [key, 'local'] });
        }
      } catch (e) {
        // best-effort: server 不通不影响 local
        console.warn(`[sync ${key}] failed:`, e);
      }
    },
    [status, queryClient],
  );
}

// 上面 useRef 引用, 补 import
import { useCallback, useRef } from 'react';

/* ===== Mutations ===== */

export async function addSchedule(input: Omit<LocalSchedule, 'id' | 'createdAt' | 'updatedAt' | 'dirty' | 'syncedAt' | 'notified' | 'deleted'>): Promise<LocalSchedule> {
  const now = Date.now();
  const item: LocalSchedule = {
    id: uuid(),
    createdAt: now,
    updatedAt: now,
    notified: false,
    dirty: true,
    syncedAt: undefined,
    deleted: false,
    ...input,
  };
  await storagePut('schedules', item as unknown as Record<string, unknown>);
  // TODO: 触发 push sync
  return item;
}

export async function updateSchedule(id: string, patch: Partial<LocalSchedule>): Promise<void> {
  const cur = await storageGet<LocalSchedule>('schedules', id);
  if (!cur) return;
  const next = markDirty({ ...cur, ...patch });
  await storagePut('schedules', next as unknown as Record<string, unknown>);
}

export async function deleteSchedule(id: string): Promise<void> {
  const cur = await storageGet<LocalSchedule>('schedules', id);
  if (!cur) return;
  await storagePut('schedules', { ...cur, deleted: true, dirty: true, updatedAt: Date.now() } as unknown as Record<string, unknown>);
}

export async function addFeed(url: string, options?: Partial<LocalFeed>): Promise<LocalFeed> {
  const now = Date.now();
  const item: LocalFeed = {
    id: uuid(),
    url,
    title: options?.title,
    source: options?.source,
    priority: options?.priority ?? 'normal',
    enabled: options?.enabled ?? true,
    createdAt: now,
    updatedAt: now,
    dirty: true,
    syncedAt: undefined,
    deleted: false,
  };
  await storagePut('feeds', item as unknown as Record<string, unknown>);
  return item;
}

export async function addMemory(input: { category: string; content: string; importance?: LocalMemory['importance']; source?: string }): Promise<LocalMemory> {
  const now = Date.now();
  const item: LocalMemory = {
    id: uuid(),
    category: input.category,
    content: input.content,
    importance: input.importance ?? 3,
    source: input.source,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    dirty: true,
    syncedAt: undefined,
    deleted: false,
  };
  await storagePut('memories', item as unknown as Record<string, unknown>);
  return item;
}
