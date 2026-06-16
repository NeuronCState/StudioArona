/**
 * ConflictMergeDialog — 手动合并 sync 冲突
 *
 * 触发: ConflictStore.conflicts 非空 (useSync 推 dirty doc 收到 409 时入)
 *
 * UX (跟 StorageMigrationBanner 同 pattern — framer-motion 一次性弹窗):
 * - 列 server vs client 字段 diff (高亮差异)
 * - 3 选项: 用本地 / 用 server / 手动编辑 (inline form)
 * - 选完:
 *   - 用 server: 直接覆盖本地 (同步 server doc), 标 clean, 从 store 移除
 *   - 用本地: 重推 server (PATCH 带新 expected_updated_at = server 当前 updated_at),
 *     成功则本地标 clean, 失败再走 409
 *   - 手动编辑: 用户改字段, 然后用本地 (走 PATCH)
 *
 * 边界:
 * - 多冲突: 一次只解一个, 顺序按 detectedAt ASC (先到先解)
 * - 全解完: dialog 关闭
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Cloud, Laptop, Pencil, X } from 'lucide-react';
import { Dialog, Button, Input, Textarea } from '@javis/ui-kit';

import * as storage from '@/lib/storage';
import { api, ApiError } from '@/lib/api/client';
import { useConflicts } from '@/lib/sync/useConflicts';
import { useConflictStore, type ScheduleConflict } from '@/lib/sync/ConflictStore';
import { cn } from '@/lib/utils';

const DIFF_FIELDS = ['title', 'body', 'starts_at', 'location'] as const;
type DiffField = (typeof DIFF_FIELDS)[number];

const FIELD_LABELS: Record<DiffField, string> = {
  title: '标题',
  body: '详情',
  starts_at: '开始时间',
  location: '地点',
};

function displayVal(v: unknown): string {
  if (v == null || v === '') return '（空）';
  return String(v);
}

function isDifferent(server: unknown, client: unknown): boolean {
  return JSON.stringify(server ?? null) !== JSON.stringify(client ?? null);
}

interface ResolvedDoc {
  title: string;
  body: string;
  starts_at: string;
  location: string;
}

function docToResolved(d: Record<string, unknown>): ResolvedDoc {
  return {
    title: String(d.title ?? ''),
    body: String(d.body ?? ''),
    starts_at: String(d.starts_at ?? ''),
    location: String(d.location ?? ''),
  };
}

export function ConflictMergeDialog() {
  const { conflicts, resolve } = useConflicts();
  const sorted = useMemo(
    () => [...conflicts].sort((a, b) => a.detectedAt - b.detectedAt),
    [conflicts],
  );
  const current = sorted[0];
  const open = !!current;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<ResolvedDoc>({ title: '', body: '', starts_at: '', location: '' });

  useEffect(() => {
    if (current && current.table === 'schedules') {
      setForm(docToResolved(current.clientDoc));
      setEditing(false);
      setErr(null);
    }
  }, [current]);

  if (!current || current.table !== 'schedules') return null;
  const c = current as ScheduleConflict;

  const close = () => resolve(c.table, c.docId);

  /** "用 server" — 本地直接被 server doc 覆盖 */
  const applyServer = async () => {
    setBusy(true);
    setErr(null);
    try {
      const synced = {
        ...(c.serverDoc as Record<string, unknown>),
        serverId: c.serverDoc.id,
        dirty: false,
        updatedAt: Date.now(),
        serverUpdatedAt: c.serverDoc.updated_at,
      };
      await storage.put('schedules', synced as unknown as Record<string, unknown>);
      close();
    } catch (e) {
      setErr(`本地写入失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  /** "用本地" — PATCH server 带 server 当前 updated_at 当 expected_updated_at */
  const applyClient = async (override?: ResolvedDoc) => {
    setBusy(true);
    setErr(null);
    try {
      const base = override ?? docToResolved(c.clientDoc);
      const resp = await api.patch<Record<string, unknown>>(`/schedules/${c.docId}`, {
        title: base.title,
        body: base.body || null,
        starts_at: base.starts_at,
        location: base.location || null,
        expected_updated_at: c.serverDoc.updated_at,
      });
      const synced = {
        id: c.docId,
        serverId: c.docId,
        title: (resp.title as string) ?? base.title,
        body: (resp.body as string) ?? base.body,
        starts_at: (resp.starts_at as string) ?? base.starts_at,
        location: (resp.location as string) ?? base.location,
        source: 'server',
        dirty: false,
        updatedAt: Date.now(),
        serverUpdatedAt: resp.updated_at as string | undefined,
      };
      await storage.put('schedules', synced as unknown as Record<string, unknown>);
      close();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const body = (e.body ?? {}) as { server?: Record<string, unknown>; client?: Record<string, unknown>; field_diff?: string[] };
        if (body.server) {
          useConflictStore.getState().addConflict({
            table: 'schedules',
            docId: c.docId,
            serverDoc: body.server,
            clientDoc: { ...(c.clientDoc as Record<string, unknown>), ...form, expected_updated_at: c.serverDoc.updated_at },
            fieldDiff: body.field_diff ?? [],
            detectedAt: Date.now(),
          });
          close();
        } else {
          setErr('服务器再次拒绝 (409), 请重试');
        }
      } else {
        setErr(`推送失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitManual = () => applyClient(form);

  return (
    <AnimatePresence>
      {open && (
        <Dialog open onClose={close}>
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="w-[min(640px,92vw)]"
          >
            <div className="rounded-2xl border border-amber-200 bg-white shadow-xl dark:border-amber-800/50 dark:bg-stone-900">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4 dark:border-stone-700">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
                    <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">
                      日程同步冲突
                    </p>
                    <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                      本地和服务器上都有修改，请选择保留哪一版。
                      {sorted.length > 1 && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          还有 {sorted.length - 1} 个待解决
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  className="shrink-0 rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600 disabled:opacity-50 dark:hover:bg-stone-800"
                  aria-label="关闭"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Diff table */}
              {!editing && (
                <div className="px-5 py-4">
                  <div className="overflow-hidden rounded-xl border border-stone-200 dark:border-stone-700">
                    <div className="grid grid-cols-[80px_1fr_1fr] bg-stone-50 text-[11px] font-medium uppercase tracking-wider text-stone-500 dark:bg-stone-800/60 dark:text-stone-400">
                      <div className="px-3 py-2">字段</div>
                      <div className="flex items-center gap-1.5 border-l border-stone-200 px-3 py-2 dark:border-stone-700">
                        <Laptop size={12} />
                        本地
                      </div>
                      <div className="flex items-center gap-1.5 border-l border-stone-200 px-3 py-2 dark:border-stone-700">
                        <Cloud size={12} />
                        服务器
                      </div>
                    </div>
                    {DIFF_FIELDS.map((field) => {
                      const sVal = c.serverDoc[field];
                      const cVal = c.clientDoc[field];
                      const diff = isDifferent(sVal, cVal);
                      return (
                        <div
                          key={field}
                          className={cn(
                            'grid grid-cols-[80px_1fr_1fr] border-t border-stone-200 text-xs dark:border-stone-700',
                            diff && 'bg-amber-50/60 dark:bg-amber-900/10',
                          )}
                        >
                          <div className="px-3 py-2 font-medium text-stone-600 dark:text-stone-300">
                            {FIELD_LABELS[field]}
                          </div>
                          <div
                            className={cn(
                              'border-l border-stone-200 px-3 py-2 text-stone-700 dark:border-stone-700 dark:text-stone-200',
                              diff && 'font-medium text-amber-800 dark:text-amber-200',
                            )}
                          >
                            {displayVal(cVal)}
                          </div>
                          <div
                            className={cn(
                              'border-l border-stone-200 px-3 py-2 text-stone-700 dark:border-stone-700 dark:text-stone-200',
                              diff && 'font-medium text-amber-800 dark:text-amber-200',
                            )}
                          >
                            {displayVal(sVal)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {err && (
                    <p className="mt-3 text-xs text-red-600 dark:text-red-400">{err}</p>
                  )}
                </div>
              )}

              {/* Manual edit form */}
              {editing && (
                <div className="space-y-3 px-5 py-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-stone-500">
                      {FIELD_LABELS.title}
                    </label>
                    <Input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      disabled={busy}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-stone-500">
                      {FIELD_LABELS.body}
                    </label>
                    <Textarea
                      value={form.body}
                      onChange={(e) => setForm({ ...form, body: e.target.value })}
                      disabled={busy}
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-stone-500">
                        {FIELD_LABELS.starts_at}
                      </label>
                      <Input
                        value={form.starts_at}
                        onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                        disabled={busy}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-stone-500">
                        {FIELD_LABELS.location}
                      </label>
                      <Input
                        value={form.location}
                        onChange={(e) => setForm({ ...form, location: e.target.value })}
                        disabled={busy}
                      />
                    </div>
                  </div>
                  {err && (
                    <p className="text-xs text-red-600 dark:text-red-400">{err}</p>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-200 bg-stone-50 px-5 py-3 dark:border-stone-700 dark:bg-stone-800/40">
                {!editing ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => applyClient()} disabled={busy}>
                      <span className="inline-flex items-center gap-1.5">
                        <Laptop size={14} />
                        用本地
                      </span>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={applyServer} disabled={busy}>
                      <span className="inline-flex items-center gap-1.5">
                        <Cloud size={14} />
                        用服务器
                      </span>
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => setEditing(true)} disabled={busy}>
                      <span className="inline-flex items-center gap-1.5">
                        <Pencil size={14} />
                        手动编辑
                      </span>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                      返回
                    </Button>
                    <Button size="sm" variant="primary" onClick={submitManual} disabled={busy || !form.title || !form.starts_at}>
                      推送我的版本
                    </Button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}