/**
 * PageMonitorCard + PageMonitorEditDialog — page monitor 卡片 + 编辑弹窗.
 *
 * 状态展示 (P2#20):
 *   - last_checked_at, last_changed_at
 *   - enabled / paused
 *   - check_interval_min
 *   - 最近一次事件时间 (从 page_monitor_events 拉)
 *
 * 编辑 (P2#19): name / css_selector / check_interval_min / enabled
 * 操作: 保存 / 立即检查 / 暂停/启用 / 删除
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Play, Pause, RefreshCw, X, Check } from "lucide-react";
import { api } from "@/lib/api/client";
import { useUIStore } from "@/stores/ui";
import { useT } from "@/lib/i18n";
import type { PageMonitor } from "@/types/contracts";
import { formatRelativeTime } from "@/lib/utils";

interface MonitorWithMeta extends PageMonitor {
  /** 最近一次事件时间 (从 page_monitor_events 派生) — null 表示从未触发 */
  last_event_at?: string | null;
}

function timeAgo(
  iso: string | null,
  t: (key: string, args?: Record<string, string | number>) => string,
): string {
  if (!iso) return t("time.never");
  return formatRelativeTime(iso);
}

export function PageMonitorCard({
  monitor,
  onOpen,
}: {
  monitor: MonitorWithMeta;
  onOpen?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const t = useT();
  const [editing, setEditing] = useState(false);
  const enabled = monitor.enabled;

  const toggleMutation = useMutation({
    mutationFn: (next: boolean) =>
      api.patch<PageMonitor>(`/page-monitors/${monitor.id}`, { enabled: next }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["page-monitors"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/page-monitors/${monitor.id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["page-monitors"] }),
  });

  const checkMutation = useMutation({
    mutationFn: () =>
      api.post<{ changed: boolean; summary?: string }>(
        `/page-monitors/${monitor.id}/check`,
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["page-monitors"] });
      if (data.changed) {
        // 走 SSE 也会再推一次, 这里确保同步反馈 (toast 比 alert 不阻塞 UI)
        addToast(
          data.summary
            ? t("pageMonitor.changeDetected", { summary: data.summary })
            : t("pageMonitor.changeDetectedEmpty"),
          "info",
        );
      }
    },
  });

  return (
    <>
      <div
        className="card group cursor-pointer space-y-2"
        onClick={() => onOpen?.(`monitor:${monitor.id}`)}
      >
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                enabled ? "bg-violet-500" : "bg-zinc-400"
              }`}
              title={
                enabled ? t("pageMonitor.monitoring") : t("pageMonitor.paused")
              }
            />
            <h3 className="text-sm font-medium text-[var(--color-text-primary)] line-clamp-2">
              {monitor.label}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                checkMutation.mutate();
              }}
              disabled={checkMutation.isPending}
              className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-accent)] disabled:opacity-50"
              title={t("pageMonitor.checkNow")}
            >
              <RefreshCw
                size={13}
                className={checkMutation.isPending ? "animate-spin" : ""}
              />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleMutation.mutate(!enabled);
              }}
              className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              title={enabled ? t("pageMonitor.pause") : t("pageMonitor.enable")}
            >
              {enabled ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
              title={t("pageMonitor.edit")}
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (
                  confirm(
                    t("pageMonitor.deleteConfirm", { title: monitor.label }),
                  )
                )
                  deleteMutation.mutate();
              }}
              className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
              title={t("pageMonitor.delete")}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)] truncate">
          {monitor.url}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--color-text-muted)]">
          <span>
            {t("pageMonitor.checkEvery", { n: monitor.check_interval_min })}
          </span>
          <span>·</span>
          <span title={monitor.last_checked_at ?? ""}>
            {t("pageMonitor.lastCheck")}: {timeAgo(monitor.last_checked_at, t)}
          </span>
          {monitor.last_changed_at && (
            <>
              <span>·</span>
              <span title={monitor.last_changed_at} className="text-violet-600">
                {t("pageMonitor.lastChange")}:{" "}
                {timeAgo(monitor.last_changed_at, t)}
              </span>
            </>
          )}
          {monitor.css_selector !== "body" && (
            <>
              <span>·</span>
              <span className="font-mono text-[9px]">
                {monitor.css_selector}
              </span>
            </>
          )}
        </div>
      </div>
      {editing && (
        <PageMonitorEditDialog
          monitor={monitor}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
    </>
  );
}

interface EditDialogProps {
  monitor: PageMonitor;
  onClose: () => void;
  onSaved: () => void;
}

function PageMonitorEditDialog({ monitor, onClose, onSaved }: EditDialogProps) {
  const queryClient = useQueryClient();
  const t = useT();
  const [label, setLabel] = useState(monitor.label);
  const [cssSelector, setCssSelector] = useState(monitor.css_selector);
  const [interval, setInterval] = useState(monitor.check_interval_min);
  const [enabled, setEnabled] = useState(monitor.enabled);

  // ESC 关
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = useMutation({
    mutationFn: () =>
      api.patch<PageMonitor>(`/page-monitors/${monitor.id}`, {
        label: label.trim(),
        css_selector: cssSelector.trim() || "body",
        check_interval_min: interval,
        enabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["page-monitors"] });
      onSaved();
    },
  });

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {t("pageMonitor.editDialogTitle")}
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)]"
            aria-label={t("pageMonitor.close")}
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <Field label={t("pageMonitor.field.name")}>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="input w-full"
              autoFocus
            />
          </Field>
          <Field
            label={t("pageMonitor.field.url")}
            hint={t("pageMonitor.field.urlHint")}
          >
            <input
              value={monitor.url}
              readOnly
              className="input w-full opacity-60"
            />
          </Field>
          <Field
            label={t("pageMonitor.field.cssSelector")}
            hint={t("pageMonitor.field.cssSelectorHint")}
          >
            <input
              value={cssSelector}
              onChange={(e) => setCssSelector(e.target.value)}
              placeholder="body"
              className="input w-full font-mono text-xs"
            />
          </Field>
          <Field label={t("pageMonitor.field.interval")}>
            <input
              type="number"
              min={1}
              max={1440}
              value={interval}
              onChange={(e) =>
                setInterval(
                  Math.max(1, Math.min(1440, Number(e.target.value) || 1)),
                )
              }
              className="input w-full"
            />
          </Field>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-xs">{t("pageMonitor.field.enabled")}</span>
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-xs">
            {t("common.cancel")}
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!label.trim() || save.isPending}
            className="btn-primary inline-flex items-center gap-1 text-xs disabled:opacity-50"
          >
            <Check size={12} />
            {save.isPending ? t("pageMonitor.saving") : t("pageMonitor.save")}
          </button>
        </div>
        {save.isError && (
          <p className="mt-2 text-[11px] text-[var(--color-error)]">
            {t("pageMonitor.saveFailed", {
              msg: (save.error as Error).message,
            })}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-[11px] font-medium text-[var(--color-text-secondary)]">
          {label}
        </label>
        {hint && (
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
