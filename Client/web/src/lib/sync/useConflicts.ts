/**
 * useConflicts — React hook 包 ConflictStore, 给组件订阅 conflicts list + resolve
 */
import { useCallback } from "react";
import { useConflictStore, type Conflict, conflictKey } from "./ConflictStore";

export function useConflicts() {
  const conflicts = useConflictStore((s) => s.conflicts);
  const resolveConflict = useConflictStore((s) => s.resolveConflict);

  const list: Conflict[] = Object.values(conflicts);
  const resolve = useCallback(
    (table: Conflict["table"], docId: string) => {
      resolveConflict(conflictKey(table, docId));
    },
    [resolveConflict],
  );

  return { conflicts: list, resolve };
}
