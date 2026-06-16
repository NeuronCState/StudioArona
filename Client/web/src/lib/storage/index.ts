/**
 * Storage adapter — 桌面用 OS 文件, Web 用 IDB
 *
 * 拍板 (2026-06-16):
 * - Tauri 桌面 (.app/.dmg): 写到 ~/Documents/studioarona/<data_type>/<id>.json
 * - Web 端 (浏览器打开): 走 IDB
 *
 * API 形态: 跟 Dexie 的 put/get/del/listAll/clear 一致,
 * 内部根据 `isTauri()` 自动 dispatch 到 fs 或 IDB
 */
import { isTauri } from './platform';
import * as idb from './idb-storage';
import * as fs from './fs-storage';

export type Table = 'schedules' | 'feeds' | 'feedItems' | 'memories' | 'skills' | 'weather' | 'system';

const useFs = isTauri();
// console.info(`[storage] backend: ${useFs ? 'fs' : 'idb'}`);

/* ===== Generic CRUD ===== */

export async function put(table: Table, doc: Record<string, unknown>): Promise<void> {
  if (useFs) return fs.put(table, doc);
  return idb.put(table, doc);
}

export async function get<T = unknown>(table: Table, id: string): Promise<T | undefined> {
  if (useFs) return fs.get<T>(table, id);
  return idb.get<T>(table, id);
}

export async function del(table: Table, id: string): Promise<void> {
  if (useFs) return fs.del(table, id);
  return idb.del(table, id);
}

export async function listAll<T = unknown>(table: Table): Promise<T[]> {
  if (useFs) return fs.listAll<T>(table);
  return idb.listAll<T>(table);
}

export async function clear(table: Table): Promise<void> {
  if (useFs) return fs.clear(table);
  return idb.clear(table);
}

/* ===== Migration: IDB → FS (Tauri 首次启动时) ===== */

/** 检测是否需要迁移: 在 Tauri 桌面, IDB 已经有数据, 但 FS 还是空 */
export async function needsMigration(): Promise<boolean> {
  if (!useFs) return false;
  const fsHasData = await fs.hasAnyData();
  if (fsHasData) return false;
  // 看 IDB 是否有数据
  const idbSchedules = await idb.listAll<Record<string, unknown>>('schedules');
  return idbSchedules.length > 0;
}

/** 把 IDB 全部数据搬到 FS, 完成后清 IDB */
export async function migrateFromIdb(): Promise<{ migrated: number }> {
  if (!useFs) return { migrated: 0 };
  let migrated = 0;
  const tables: Table[] = ['schedules', 'feeds', 'feedItems', 'memories', 'skills'];
  for (const t of tables) {
    const rows = await idb.listAll<Record<string, unknown>>(t);
    for (const row of rows) {
      await fs.put(t, row);
      migrated++;
    }
    await idb.clear(t);
  }
  return { migrated };
}

/* ===== Info ===== */
export function backendType(): 'tauri-fs' | 'indexeddb' {
  return useFs ? 'tauri-fs' : 'indexeddb';
}

export const DATA_ROOT = 'studioarona';
