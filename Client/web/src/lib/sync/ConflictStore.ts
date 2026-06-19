/**
 * ConflictStore — zustand 状态机, 存「dirty doc 被 server 拒 (409)」的待合并冲突
 *
 * 触发: 本地资源同步收到 409, 把 server doc + client doc 存进这里
 * 消费: ConflictMergeDialog 列 conflict, 用户选 / 编, 调 resolve() 写回本地 + push server
 *
 * 设计:
 * - key = `${table}:${docId}` (冲突可能在 schedules / feeds / memory / skills 任一 table)
 * - value = { serverDoc, clientDoc, fieldDiff[], detectedAt }
 * - 不持久化 (冲突是 transient, 关页面就丢; 用户还没解决的冲突回放下也没用)
 */
import { create } from "zustand";

export interface ScheduleConflict {
  table: "schedules";
  docId: string;
  serverDoc: Record<string, unknown>;
  clientDoc: Record<string, unknown>;
  fieldDiff: string[];
  detectedAt: number;
}

export type Conflict = ScheduleConflict;

interface ConflictState {
  conflicts: Record<string, Conflict>;
  addConflict: (c: Conflict) => void;
  resolveConflict: (key: string) => void;
  clearAll: () => void;
}

function keyOf(c: Conflict): string {
  return `${c.table}:${c.docId}`;
}

export const useConflictStore = create<ConflictState>((set) => ({
  conflicts: {},
  addConflict: (c) =>
    set((state) => ({
      conflicts: { ...state.conflicts, [keyOf(c)]: c },
    })),
  resolveConflict: (key) =>
    set((state) => {
      const next = { ...state.conflicts };
      delete next[key];
      return { conflicts: next };
    }),
  clearAll: () => set({ conflicts: {} }),
}));

/** 给外部按 table+id 取冲突 key */
export function conflictKey(table: Conflict["table"], docId: string): string {
  return `${table}:${docId}`;
}
