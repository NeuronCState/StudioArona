/**
 * useNotificationStream — 订阅 server /api/events SSE 流.
 *
 * 协议 (server 端 events.rs):
 *   event: ready                     → 握手
 *   event: notification              → AppEvent::NotificationCreated
 *   event: page_monitor_change       → AppEvent::PageMonitorChange
 *   event: lagged                     → 消费太慢, 丢了 N 条
 *
 * 行为:
 * - 连接需要 JWT (EventSource 不支持自定义 header, 用 ?token=<jwt>)
 * - 自动按 user 过滤 (server 端做, 前端只看到自己的事件)
 * - 断开后 5s 退避重连, 重连成功先 fetch /api/notifications 拿增量
 * - 只在 online mode 才连; 离线时让 React Query 走 IDB 兜底
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth";
import { useConnectionStore } from "@/stores/connection";
import { useUIStore } from "@/stores/ui";
import { useT } from "@/lib/i18n";
import type { AppNotification } from "@/types/contracts";

const EVENTS_PATH = "/api/events";
const RECONNECT_DELAY_MS = 5_000;

interface RawSseEvent {
  type: "notification" | "page_monitor_change";
  id: string;
  user_id: string;
  // notification 字段
  title?: string;
  body?: string | null;
  level?: string;
  created_at?: string;
  // page_monitor_change 字段
  event_id?: string;
  monitor_id?: string;
  label?: string;
  url?: string;
  summary?: string | null;
}

function mapLevel(raw: string | undefined): "info" | "warn" | "error" {
  if (raw === "warn" || raw === "warning") return "warn";
  if (raw === "error") return "error";
  return "info";
}

export function useNotificationStream() {
  const queryClient = useQueryClient();
  const online = useConnectionStore((s) => s.effectiveMode()) === "online";
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.accessToken);
  const addToast = useUIStore((s) => s.addToast);
  const t = useT();
  const stoppedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 让 effect 拿到最新的 t, 避免闭包陷阱
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    // 没登录 或 离线 → 不连 (offline 时让 RQ 走 IDB 兜底)
    if (!isAuth || !online || !token) {
      return;
    }
    stoppedRef.current = false;

    function connect() {
      if (stoppedRef.current) return;
      const url = `${EVENTS_PATH}?token=${encodeURIComponent(token!)}`;
      const es = new EventSource(url, { withCredentials: false });

      es.addEventListener("ready", () => {
        // 握手成功 → 拉一次最新未读数 (兜底: 重连后补齐增量)
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      });

      es.addEventListener("notification", (e) => {
        try {
          const raw: RawSseEvent = JSON.parse((e as MessageEvent).data);
          if (raw.type !== "notification") return;
          const note: AppNotification = {
            id: raw.id,
            title: raw.title ?? "",
            body: raw.body ?? null,
            level: mapLevel(raw.level),
            read: false,
            created_at: raw.created_at ?? new Date().toISOString(),
          };
          // 1. 推入通知列表缓存 (前置插入)
          queryClient.setQueryData<{
            items: AppNotification[];
            unread_count: number;
          }>(["notifications", "list"], (prev) => {
            const items = prev?.items ?? [];
            // dedupe by id (避免 server 重发导致重复)
            if (items.some((i) => i.id === note.id)) return prev;
            return {
              items: [note, ...items].slice(0, 100),
              unread_count: (prev?.unread_count ?? 0) + 1,
            };
          });
          queryClient.invalidateQueries({
            queryKey: ["notifications", "unread-count"],
          });
          // 2. 弹 toast (level 转 toast level)
          const tx = tRef.current;
          addToast(
            note.body
              ? tx("sse.notificationTitleWithBody", {
                  title: note.title,
                  body: note.body,
                })
              : note.title,
            note.level,
          );
        } catch (err) {
          console.warn("[notification SSE] parse failed", err);
        }
      });

      es.addEventListener("page_monitor_change", (e) => {
        try {
          const raw: RawSseEvent = JSON.parse((e as MessageEvent).data);
          if (raw.type !== "page_monitor_change") return;
          const label = raw.label ?? "";
          // 让 RQ 重新拉该 monitor 的 events 列表 + 详情页 query key
          if (raw.monitor_id) {
            queryClient.invalidateQueries({
              queryKey: ["page-monitors", raw.monitor_id, "events"],
            });
            queryClient.invalidateQueries({
              queryKey: ["feed-items", `monitor:${raw.monitor_id}`],
            });
          }
          queryClient.invalidateQueries({ queryKey: ["page-monitors"] });
          const tx = tRef.current;
          addToast(
            raw.body
              ? tx("sse.pageMonitorChangeWithBody", { label, body: raw.body })
              : tx("sse.pageMonitorChangeDefault", { label }),
            "info",
          );
        } catch (err) {
          console.warn("[page_monitor_change SSE] parse failed", err);
        }
      });

      es.addEventListener("lagged", () => {
        // server 端 broadcast buffer 满了丢了一些 — 重新拉一次兜底
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      });

      es.onerror = () => {
        // EventSource 自动重连, 但这里要清掉旧 listener 防泄漏 + 退避防雪崩
        es.close();
        if (!stoppedRef.current) {
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    }

    connect();
    return () => {
      stoppedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [isAuth, online, token, queryClient, addToast]);
}
