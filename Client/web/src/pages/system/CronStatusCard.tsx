/**
 * CronStatusCard — 显示后台 cron 任务心跳 + 错误.
 * 数据来自 /api/system/cron-status (Rust cron_tracker).
 */
import { Activity, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { useT } from "@/lib/i18n";

export interface CronStatus {
  name: string;
  last_tick_at: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  total_ticks: number;
  total_errors: number;
}

function timeAgo(
  iso: string | null,
  t: (key: string, args?: Record<string, string | number>) => string,
): string {
  if (!iso) return t("time.dash");
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return t("time.justNow");
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return t("time.secondsAgo", { n: sec });
  const min = Math.floor(sec / 60);
  if (min < 60) return t("time.minutesAgo", { n: min });
  const h = Math.floor(min / 60);
  return t("time.hoursAgo", { n: h });
}

function cronLabel(name: string, t: (key: string) => string): string {
  if (name === "rss") return t("cron.rss");
  if (name === "page_monitor") return t("cron.pageMonitor");
  return name;
}

export function CronStatusCard({ crons }: { crons: CronStatus[] }) {
  const t = useT();
  if (crons.length === 0) return null;
  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <Activity size={14} className="text-[var(--color-accent)]" />
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
          {t("cron.title")}
        </h3>
      </div>
      <div className="space-y-2">
        {crons.map((c) => {
          const healthy = c.last_error === null && c.last_tick_at !== null;
          return (
            <div
              key={c.name}
              className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2">
                {healthy ? (
                  <CheckCircle2
                    size={13}
                    className="shrink-0 text-emerald-500"
                  />
                ) : (
                  <AlertTriangle
                    size={13}
                    className="shrink-0 text-amber-500"
                  />
                )}
                <span className="font-medium text-[var(--color-text-primary)]">
                  {cronLabel(c.name, t)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {timeAgo(c.last_tick_at, t)}
                </span>
                <span>
                  {t("cron.totalTicks", { n: c.total_ticks })}
                  {c.total_errors > 0 && (
                    <span className="ml-1 text-amber-500">
                      {t("cron.errorCount", { n: c.total_errors })}
                    </span>
                  )}
                </span>
              </div>
              {c.last_error && (
                <p
                  className="mt-1 truncate text-[10px] text-amber-600"
                  title={c.last_error}
                >
                  {t("cron.lastError", { msg: c.last_error })}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
