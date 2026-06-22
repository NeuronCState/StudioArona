/**
 * Tauri fs backend — 桌面端
 *
 * 路径: ~/Documents/studioarona/<table>/<id>.json
 * 每行一个 JSON 文件, 用户用 Finder/git/AI 工具能直接读
 *
 * 通过 @tauri-apps/api 的 invoke + tauri-plugin-fs 写
 */
import {
  mkdir,
  readDir,
  readTextFile,
  writeTextFile,
  remove,
  exists,
} from "@tauri-apps/plugin-fs";
import { homeDir } from "@tauri-apps/api/path";

type Table =
  | "schedules"
  | "feeds"
  | "feedItems"
  | "memories"
  | "skills"
  | "weather"
  | "system";

/** 解析 ~/Documents/studioarona/<table>/<id>.json 的绝对路径 */
async function filePath(table: Table, id: string): Promise<string> {
  // 路径: $HOME/Documents/studioarona/<table>/<id>.json
  // appDataDir() = $HOME/Library/Application Support/<bundleId> (Tauri 默认)
  // 但我们想要 ~/Documents/, 所以用 $HOME + 拼
  // Tauri 2 没直接给 $HOME, 但 fs scope 已经 allow $HOME/Documents/studioarona/**
  const home = await homeDir();
  // homeDir() 返回的路径 **不带尾斜杠** (Tauri 2 + dirs crate 行为),
  // 必须显式加 `/`,否则拼成 `/Users/xxxDocuments/...` (中间缺 /),
  // 会落在 fs scope 白名单之外,writeTextFile 抛 permission denied。
  // (v3.6.1 安装后创建日程无效就是这个 bug — 用户点提交,数据写不出去,
  // 抽屉也不关。Web 端不受影响,Web 走 IDB 不走 fs。)
  return `${home}/Documents/studioarona/${table}/${id}.json`;
}

/** 解析目录路径: $HOME/Documents/studioarona/<table>/ */
async function dirPath(table: Table): Promise<string> {
  const home = await homeDir();
  return `${home}/Documents/studioarona/${table}`;
}

async function ensureDir(dir: string): Promise<void> {
  try {
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
    }
  } catch {
    // 已有目录会抛, 忽略
  }
}

export async function put(
  table: Table,
  doc: Record<string, unknown>,
): Promise<void> {
  const id = String(doc.id);
  const dir = await dirPath(table);
  await ensureDir(dir);
  const file = await filePath(table, id);
  const json = JSON.stringify(doc, null, 2);
  await writeTextFile(file, json);
}

export async function get<T = unknown>(
  table: Table,
  id: string,
): Promise<T | undefined> {
  const file = await filePath(table, id);
  try {
    if (!(await exists(file))) return undefined;
    const text = await readTextFile(file);
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

export async function del(table: Table, id: string): Promise<void> {
  const file = await filePath(table, id);
  try {
    if (await exists(file)) {
      await remove(file);
    }
  } catch {
    // 忽略
  }
}

export async function list<T = unknown>(
  table: Table,
  opts?: { sortBy?: string; reverse?: boolean },
): Promise<T[]> {
  const all = await listAll<T>(table);
  let result = all;
  if (opts?.sortBy) {
    const key = opts.sortBy as keyof T;
    result = [...all].sort((a, b) => {
      const av = a[key] as number | string;
      const bv = b[key] as number | string;
      if (av < bv) return opts.reverse ? 1 : -1;
      if (av > bv) return opts.reverse ? -1 : 1;
      return 0;
    });
  } else if (opts?.reverse) {
    result = [...all].reverse();
  }
  return result;
}

export async function listAll<T = unknown>(table: Table): Promise<T[]> {
  const dir = await dirPath(table);
  try {
    if (!(await exists(dir))) return [];
    const entries = await readDir(dir);
    const docs: T[] = [];
    for (const entry of entries) {
      if (entry.isFile && entry.name?.endsWith(".json")) {
        const id = entry.name.replace(".json", "");
        const doc = await get<T>(table, id);
        if (doc) docs.push(doc);
      }
    }
    return docs;
  } catch {
    return [];
  }
}

export async function clear(table: Table): Promise<void> {
  const dir = await dirPath(table);
  try {
    if (!(await exists(dir))) return;
    const entries = await readDir(dir);
    for (const entry of entries) {
      if (entry.isFile) {
        await remove(`${dir}/${entry.name}`);
      }
    }
  } catch {
    // 忽略
  }
}

/** 是否有任何数据 (用于迁移检测) */
export async function hasAnyData(): Promise<boolean> {
  const tables: Table[] = [
    "schedules",
    "feeds",
    "feedItems",
    "memories",
    "skills",
  ];
  for (const t of tables) {
    const items = await listAll(t);
    if (items.length > 0) return true;
  }
  return false;
}
