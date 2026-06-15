/**
 * Studio Arona 本地数据层 — IndexedDB (Dexie)
 *
 * v3 架构: 客户端数据本地优先, server 端只做协作/同步。
 * - 默认 4 磁贴 + 14 页面除 VMS/NAS/HA 外, 全部本地优先
 * - Web 端用 IndexedDB, Tauri 桌面端用 OS 文件 (后续补 fs 适配层)
 * - 连接 server 时: push 本地 + pull server + 冲突弹 manual merge dialog
 * - 离线: 完全本地, 不打 server
 *
 * Schema 设计: 每个表 `serverId` 字段, 标识 server 端 ID
 * - 本地独有: serverId = null
 * - 同步过来: serverId = uuid
 * - 冲突: syncedAt 跟 serverUpdatedAt 不一致, 弹 manual merge
 */
import Dexie, { type Table } from 'dexie';

/* ===== Schedule ===== */
export interface LocalSchedule {
  id: string;                  // 本地 id (uuid)
  serverId?: string;           // server 端 id
  title: string;
  description?: string;
  startAt: number;             // unix ms
  endAt: number;
  location?: string;
  visibility: 'private' | 'team' | 'public';
  reminderMinutes?: number;
  notified: boolean;
  createdAt: number;
  updatedAt: number;
  syncedAt?: number;           // 上次 sync 成功时间
  dirty: boolean;              // 本地改了, 待 push
  deleted?: boolean;           // 软删 (sync 时清 server)
}

/* ===== Feed / RSS ===== */
export interface LocalFeed {
  id: string;
  serverId?: string;
  url: string;
  title?: string;
  source?: string;
  priority: 'low' | 'normal' | 'high';
  enabled: boolean;
  lastFetchedAt?: number;
  createdAt: number;
  updatedAt: number;
  syncedAt?: number;
  dirty: boolean;
  deleted?: boolean;
}

export interface LocalFeedItem {
  id: string;
  feedId: string;              // → LocalFeed.id
  serverId?: string;
  title: string;
  link?: string;
  summary?: string;
  author?: string;
  publishedAt?: number;
  readAt?: number;
  starred: boolean;
  createdAt: number;
  updatedAt: number;
  syncedAt?: number;
  dirty: boolean;
  deleted?: boolean;
}

/* ===== Memory ===== */
export interface LocalMemory {
  id: string;
  serverId?: string;
  category: string;
  content: string;
  importance: 1 | 2 | 3 | 4 | 5;
  source?: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  syncedAt?: number;
  dirty: boolean;
  deleted?: boolean;
}

/* ===== Skill ===== */
export interface LocalSkill {
  id: string;
  serverId?: string;
  name: string;
  description?: string;
  source: 'local' | 'marketplace' | 'github';
  marketplaceId?: string;      // SkillsMP 源 ID
  githubUrl?: string;
  contentPath?: string;        // 本地 skill 文件路径
  installed: boolean;
  enabled: boolean;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  syncedAt?: number;
  dirty: boolean;
  deleted?: boolean;
}

/* ===== Weather cache ===== */
export interface LocalWeather {
  id: string;                  // = city
  city: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: string;           // 形如 "17 km/h S" 跟 WeatherTile 兼容
  windDirection: string;
  feelsLike: number;
  uvIndex: string;             // 形如 "5 (Moderate)" 跟 WeatherTile 兼容
  updatedAt: number;
}

/* ===== System metrics cache ===== */
export interface LocalSystemMetrics {
  id: string;                  // = 'singleton'
  cpu: number;
  memory: number;
  disk: number;
  networkIn: number;
  networkOut: number;
  vmsTotal: number;
  vmsRunning: number;
  updatedAt: number;
}

/* ===== Dexie instance ===== */
export class StudioAronaDB extends Dexie {
  schedules!: Table<LocalSchedule, string>;
  feeds!: Table<LocalFeed, string>;
  feedItems!: Table<LocalFeedItem, string>;
  memories!: Table<LocalMemory, string>;
  skills!: Table<LocalSkill, string>;
  weather!: Table<LocalWeather, string>;
  systemMetrics!: Table<LocalSystemMetrics, string>;

  constructor() {
    super('studioarona');
    this.version(1).stores({
      // index 字段: 主键 id, 索引字段
      schedules: 'id, serverId, startAt, dirty, syncedAt, deleted',
      feeds: 'id, serverId, url, dirty, syncedAt, deleted',
      feedItems: 'id, feedId, publishedAt, readAt, starred, dirty, deleted',
      memories: 'id, serverId, category, importance, dirty, syncedAt, deleted',
      skills: 'id, serverId, source, installed, enabled, dirty, syncedAt, deleted',
      weather: 'id, city, updatedAt',
      systemMetrics: 'id, updatedAt',
    });
  }
}

export const db = new StudioAronaDB();

/* ===== Helpers ===== */

/** 生成 uuid (用 crypto.randomUUID, 浏览器 + Tauri 都支持) */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback (老浏览器)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 标记 dirty (本地改了, 待 push) */
export function markDirty<T extends { dirty?: boolean; updatedAt: number }>(item: T): T {
  return { ...item, dirty: true, updatedAt: Date.now() };
}

/** 软删 */
export function softDelete<T extends { deleted?: boolean; updatedAt: number }>(item: T): T {
  return { ...item, deleted: true, updatedAt: Date.now() };
}
