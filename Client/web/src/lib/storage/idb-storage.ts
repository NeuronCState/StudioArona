/**
 * IDB backend — Web 端 fallback
 *
 * 跟之前 Client/web/src/lib/db/index.ts 用同一个 Dexie schema, 但只 export storage API
 * (不重复 schema)
 */
import {
  db,
  type LocalSchedule,
  type LocalFeed,
  type LocalFeedItem,
  type LocalMemory,
  type LocalSkill,
} from "../db";

type Table =
  | "schedules"
  | "feeds"
  | "feedItems"
  | "memories"
  | "skills"
  | "weather"
  | "system";

function dbTable(table: Table): string {
  return table === "system" ? "systemMetrics" : table;
}

export async function put(
  table: Table,
  doc: Record<string, unknown>,
): Promise<void> {
  await db.table(dbTable(table)).put(doc);
}

export async function get<T = unknown>(
  table: Table,
  id: string,
): Promise<T | undefined> {
  return (await db.table(dbTable(table)).get(id)) as T | undefined;
}

export async function del(table: Table, id: string): Promise<void> {
  await db.table(dbTable(table)).delete(id);
}

export async function listAll<T = unknown>(table: Table): Promise<T[]> {
  return (await db.table(dbTable(table)).toArray()) as T[];
}

export async function clear(table: Table): Promise<void> {
  await db.table(dbTable(table)).clear();
}

export type {
  LocalSchedule,
  LocalFeed,
  LocalFeedItem,
  LocalMemory,
  LocalSkill,
};
