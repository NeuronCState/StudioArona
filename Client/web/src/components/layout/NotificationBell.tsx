/**
 * NotificationBell + Panel — 顶部铃铛 + 下拉列表.
 *
 * - 用 React Query 拿 /api/notifications 列表 + 未读数
 * - 实时增量靠 useNotificationStream SSE 推送
 * - 点击单条: mark read + 跳转 (暂时只 mark read)
 * - "全部已读": POST /api/notifications/read-all
 */
import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck } from "lucide-react";
import { api } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import type {
  AppNotification,
  NotificationListResponse,
} from "@/types/contracts";

function timeAgo(
  iso: string,
  t: (key: string, args?: Record<string, string | number>) => string,
): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return t("time.justNow");
  if (min < 60) return t("time.minutesAgo", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("time.hoursAgo", { n: h });
  const d = Math.floor(h / 24);
  return t("time.daysAgo", { n: d });
}

const levelStyles: Record<AppNotification["level"], string> = {
  info: "border-l-blue-400",
  warn: "border-l-amber-400",
  error: "border-l-red-500",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const t = useT();

  const { data: list } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => api.get<NotificationListResponse>("/notifications"),
    staleTime: 30_000,
  });

  const { data: unreadData } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () =>
      api.get<{ unread_count: number }>("/notifications/unread-count"),
    staleTime: 30_000,
  });

  const unread = unreadData?.unread_count ?? list?.unread_count ?? 0;
  const items = list?.items ?? [];

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // 点外面关闭
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)] transition-colors"
        aria-label={
          unread > 0
            ? t("notification.unreadBadge", { n: unread })
            : t("notification.unreadBadgeZero")
        }
      >
        <Bell size={15} />
        {unread > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium leading-none text-white"
            data-testid="notification-unread-badge"
          >
            {unread > 99 ? t("notification.badge99Plus") : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-9 z-50 w-[360px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
          role="dialog"
          aria-label={t("notification.center")}
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              {t("notification.title")}
            </h3>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="flex items-center gap-1 text-[11px] text-[var(--color-accent)] hover:underline disabled:opacity-50"
              >
                <CheckCheck size={12} />
                {t("notification.markAllRead")}
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-[var(--color-text-muted)]">
                <Bell size={24} className="mb-2 opacity-30" />
                <p className="text-xs">{t("notification.empty")}</p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.read && markRead.mutate(n.id)}
                  className={`flex w-full items-start gap-3 border-b border-[var(--color-border)] px-4 py-3 text-left text-xs transition-colors hover:bg-[var(--color-bg)] ${
                    n.read ? "opacity-60" : ""
                  } border-l-2 ${levelStyles[n.level]}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--color-text-primary)] line-clamp-1">
                        {n.title}
                      </span>
                      {!n.read && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
                      )}
                    </div>
                    {n.body && (
                      <p className="mt-1 text-[11px] text-[var(--color-text-secondary)] line-clamp-2">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                      {timeAgo(n.created_at, t)}
                    </p>
                  </div>
                  {!n.read && (
                    <Check
                      size={12}
                      className="shrink-0 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100"
                    />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
