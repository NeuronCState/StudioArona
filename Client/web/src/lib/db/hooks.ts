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

/**
 * 把 server / wttr.in 返的统一 payload 规整成 LocalWeather 格式.
 * 字段格式跟 WeatherTile 兼容: windSpeed 形如 "17 km/h S", uvIndex 形如 "5 (Moderate)".
 */
function wttrPayloadToLocal(w: Record<string, unknown>): LocalWeather {
  const city = (w.city as string) ?? '沈阳';
  const windKph = Number(w.windSpeed ?? 0);
  const windDir = (w.windDirection as string) ?? '';
  const uv = Number(w.uvIndex ?? 0);
  return {
    id: city,
    city,
    temperature: Number(w.temperature ?? 0),
    condition: (w.condition as string) ?? 'Unknown',
    humidity: Number(w.humidity ?? 0),
    windSpeed: `${windKph} km/h ${windDir}`.trim(),
    windDirection: windDir,
    feelsLike: Number(w.feelsLike ?? w.temperature ?? 0),
    uvIndex: formatUvIndex(uv),
    updatedAt: Date.now(),
  };
}

/** uvIndex 0-11+ → 文字 + (等级) 跟 WeatherTile 兼容. */
function formatUvIndex(uv: number): string {
  if (!uv || uv <= 0) return '0 (Low)';
  let label = 'Low';
  if (uv >= 3 && uv < 6) label = 'Moderate';
  else if (uv >= 6 && uv < 8) label = 'High';
  else if (uv >= 8 && uv < 11) label = 'Very High';
  else if (uv >= 11) label = 'Extreme';
  return `${uv} (${label})`;
}

/**
 * 客户端直接打 wttr.in 拿真实天气 — server 挂了 / 启动没 server / 离线时兜底.
 * wttr.in CORS 通 (`access-control-allow-origin: *`), 浏览器 fetch 即可.
 * 失败返 null (UI 显示 "暂无天气数据", 绝不 mock 假值).
 */
async function fetchWttrDirect(city: string): Promise<Record<string, unknown> | null> {
  try {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
    const r = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) return null;
    const d = await r.json();
    const cur = d?.current_condition?.[0];
    if (!cur) return null;
    const area = d?.nearest_area?.[0];
    const cityName = area?.areaName?.[0]?.value ?? city;
    const parseF = (k: string) => parseFloat(cur[k]) || 0;
    return {
      city: cityName,
      temperature: parseF('temp_C'),
      condition: cur.weatherDesc?.[0]?.value ?? 'Unknown',
      humidity: parseF('humidity'),
      windSpeed: parseF('windspeedKmph'),
      windDirection: cur.winddir16Point ?? '',
      feelsLike: parseF('FeelsLikeC') || parseF('temp_C'),
      uvIndex: parseF('uvIndex'),
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function useWeather() {
  const sync = useSync();
  const q = useQuery({
    queryKey: ['weather', 'local'],
    queryFn: async () => {
      // 1) IDB 24h 内有就用 (instant render)
      const all = await storageListAll<LocalWeather>('weather');
      const fresh = all.filter(w => Date.now() - w.updatedAt < 24 * 3600_000);
      if (fresh[0]) return fresh[0];

      // 2) 没 IDB → 试 server (server 优先, 因为 server 可能用 openweathermap 准一点)
      try {
        const w = await api.get<Record<string, unknown>>('/api/weather?city=沈阳');
        return wttrPayloadToLocal(w);
      } catch {
        // 3) server 挂 → 直连 wttr.in (no key, free, CORS 通)
        const direct = await fetchWttrDirect('沈阳');
        if (direct) return wttrPayloadToLocal(direct);
        // 4) 都拿不到 → 返 null (UI 显示 "暂无天气数据", 不假数据)
        return null;
      }
    },
    staleTime: 24 * 3600_000,
  });
  useEffect(() => {
    // 还在线时, 静默 sync server 拿最新值, 写 IDB (下次 queryFn 命中)
    sync('weather', '/api/weather?city=沈阳', async () => {
      try {
        const w = await api.get<Record<string, unknown>>('/api/weather?city=沈阳');
        return [wttrPayloadToLocal(w)];
      } catch {
        // server 不可达 → 直接 wttr.in 兜底, 同样写 IDB
        const direct = await fetchWttrDirect('沈阳');
        if (direct) return [wttrPayloadToLocal(direct)];
        return [];
      }
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
