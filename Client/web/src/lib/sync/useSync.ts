/**
 * useSync — 双向同步 coordinator (阶段 C 范围: schedules 表 only)
 *
 * 责任:
 * - 1.5s debounce, 启动 + 之后定期扫 storage adapter `schedules` table
 * - dirty=true 的 doc 推 server (POST 新建 / PATCH 更新, 带 expected_updated_at 乐观锁)
 * - 收到 409: 把 server + client + field_diff 存 ConflictStore, 不再覆盖本地 (留待用户解决)
 * - 推成功: 写回本地, dirty=false, updatedAt 刷新
 * - 离线 (effectiveMode !== 'online') 时不跑
 *
 * 设计原则:
 * - 单 timer 全局, 不开每个 useLocalResource 实例一个
 * - 防并发: 上一轮 push 没完不开始下一轮
 * - 不动 SchedulePage 现有 CRUD — SchedulePage 仍然写本地 dirty=true, useSync 后台清 dirty
 *   (这条规则意味着 dirty=true 的 doc 可能正在被用户改, push 是"尽力")
 *
 * 已知限制:
 * - 只覆盖 schedules table (feeds/memory/skills 留给 S1/S2)
 * - 没有「删 dirty 之后 server 也删」的 tombstone push (留给后续)
 * - 没做 client clock skew 校正 (允许 1 秒误差)
 */
import { useEffect } from 'react';
import * as storage from '@/lib/storage';
import { api, ApiError } from '@/lib/api/client';
import { useConnectionStore } from '@/stores/connection';
import { useConflictStore, type ScheduleConflict } from './ConflictStore';

const DEBOUNCE_MS = 1500;

/** 内部 doc 形态 — 拿 storage 列表时尽量宽, 只断言关键字段 */
interface LocalDoc {
  id: string;
  serverId?: string | null;
  dirty?: boolean;
  updatedAt?: number;
  title?: string;
  body?: string | null;
  starts_at?: string;
  location?: string | null;
  serverUpdatedAt?: string | null;
  [k: string]: unknown;
}

function isScheduleLike(d: LocalDoc): boolean {
  return typeof d.starts_at === 'string' && typeof d.title === 'string';
}

/** 把本地 doc 转成 server POST /schedules body */
function toPostBody(d: LocalDoc) {
  return {
    title: d.title,
    body: d.body ?? null,
    starts_at: d.starts_at,
    location: d.location ?? null,
  };
}

/** 把本地 doc 转成 server PATCH /schedules/:id body (带乐观锁 expected_updated_at) */
function toPatchBody(d: LocalDoc) {
  return {
    title: d.title,
    body: d.body ?? null,
    starts_at: d.starts_at,
    location: d.location ?? null,
    expected_updated_at: d.serverUpdatedAt ?? null, // 上次见到的 server 时间, 可能 undefined
  };
}

/**
 * 推一条 dirty schedule 上 server。返 'ok' | 'conflict' | 'skip' | 'error'
 * - ok: 本地已写回, dirty=false
 * - conflict: ConflictStore 已加, 等用户解决
 * - skip: 推不了 (例如 serverId 缺失), 留 dirty=true 下次再试
 * - error: 网络挂 / 401 / 5xx, 留 dirty=true 下次再试
 */
async function pushOne(d: LocalDoc): Promise<'ok' | 'conflict' | 'skip' | 'error'> {
  if (!isScheduleLike(d)) return 'skip';
  // 新建: 没 serverId → POST
  if (!d.serverId) {
    try {
      const resp = await api.post<Record<string, unknown>>('/schedules', toPostBody(d));
      const synced = { ...d, id: resp.id as string, serverId: resp.id as string, dirty: false, updatedAt: Date.now(), serverUpdatedAt: resp.updated_at as string | undefined };
      await storage.put('schedules', synced as unknown as Record<string, unknown>);
      return 'ok';
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        return 'skip';
      }
      return 'error';
    }
  }
  // 更新: 有 serverId → PATCH 带 expected_updated_at
  try {
    const resp = await api.patch<Record<string, unknown>>(`/schedules/${d.serverId}`, toPatchBody(d));
    const synced = { ...d, id: d.serverId, serverId: d.serverId, dirty: false, updatedAt: Date.now(), serverUpdatedAt: resp.updated_at as string | undefined };
    await storage.put('schedules', synced as unknown as Record<string, unknown>);
    return 'ok';
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && e.body && typeof e.body === 'object') {
      const body = e.body as { server?: Record<string, unknown>; client?: Record<string, unknown>; field_diff?: string[] };
      if (body.server && body.client) {
        const conflict: ScheduleConflict = {
          table: 'schedules',
          docId: d.serverId,
          serverDoc: body.server,
          clientDoc: body.client,
          fieldDiff: body.field_diff ?? [],
          detectedAt: Date.now(),
        };
        useConflictStore.getState().addConflict(conflict);
        return 'conflict';
      }
    }
    return 'error';
  }
}

async function pushDirtySchedules(): Promise<void> {
  const all = await storage.listAll<LocalDoc>('schedules');
  const dirty = all.filter((d) => d.dirty === true);
  for (const d of dirty) {
    await pushOne(d);
  }
}

/**
 * App.tsx 顶层 useEffect 调一次 — 启动 debounce loop
 * offline / unauth 时 idle, 不跑 timer
 */
export function useSync(): void {
  const effectiveMode = useConnectionStore((s) => s.effectiveMode());
  const online = effectiveMode === 'online';

  useEffect(() => {
    if (!online) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;

    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await pushDirtySchedules();
      } catch {
        /* 单条失败已 handle, 这层只兜底网络挂 */
      } finally {
        running = false;
        // 排下一轮 — 即使本轮有 error 也不死循环 (deferred re-check)
        timer = setTimeout(tick, DEBOUNCE_MS);
      }
    };

    // 立即跑一次, 之后每 DEBOUNCE_MS
    tick();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [online]);
}