import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  ExternalLink,
  Rss,
  Globe,
  Eye,
  Clock,
  RefreshCw,
} from "lucide-react";
import { useDelayedPending } from "@/hooks/useDelayedPending";
import { motion } from "framer-motion";
import { api } from "@/lib/api/client";
import { useLocalResource } from "@/lib/storage/useLocalResource";
import { feedResourceConfig } from "@/lib/resources/feeds";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useUIStore } from "@/stores/ui";
import type { Feed } from "@/types/contracts";
import { formatRelativeTime } from "@/lib/utils";
import { Skeleton, CardError, OfflineBanner } from "@javis/ui-kit";
import { FeedItemDetail } from "./FeedItemDetail";
import { PageMonitorCard } from "./PageMonitorCard";
import { PageLayout } from "@/components/layout/PageLayout";
import { SlideOver } from "@/components/ui/SlideOver";
import { StaggerList, StaggerItem, FadeIn } from "@/components/motion";
import { motion as m } from "@/lib/motion";
import { useT } from "@/lib/i18n";

interface PageMonitor {
  id: string;
  url: string;
  label: string;
  css_selector: string;
  last_hash: string | null;
  last_checked_at: string | null;
  last_changed_at: string | null;
  check_interval_min: number;
  enabled: boolean;
  created_at: string;
}

interface UnifiedItem {
  id: string;
  type: "rss" | "monitor";
  title: string;
  url: string;
  created_at: string;
  extra?: string;
}

function isRSSUrl(url: string): boolean {
  if (/\.(xml|rss|atom)(\?.*)?$/i.test(url)) return true;
  if (/\/(feed|rss|atom)(\/|\?|$)/i.test(url)) return true;
  return false;
}

export function FeedsPage() {
  const tr = useT();
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);

  // 本地优先 — Feed 写 storage (Tauri fs / IDB), online 时 push server (S1a endpoint)
  const localFeeds = useLocalResource(feedResourceConfig());
  const {
    data: feeds,
    isPending: feedsPending,
    isError: feedsError,
    refetch: refetchFeeds,
  } = localFeeds.query;
  const { isOffline: feedsOffline } = localFeeds;

  // Page monitors are server-backed; offline mode shows the RSS cache and hides monitor data.
  const {
    data: monitors,
    isPending: monitorsPending,
    isError: monitorsError,
    refetch: refetchMonitors,
    isOffline: monitorsOffline,
  } = useApiQuery<PageMonitor[]>({
    queryKey: ["page-monitors"],
    path: "/page-monitors",
    defaultData: [],
  });

  const unified = useMemo<UnifiedItem[]>(() => {
    const items: UnifiedItem[] = [];
    (feeds || []).forEach((f) =>
      items.push({
        id: f.id,
        type: "rss",
        title: f.title || f.url,
        url: f.url,
        created_at: f.created_at,
      }),
    );
    (monitors || []).forEach((m) =>
      items.push({
        id: m.id,
        type: "monitor",
        title: m.label,
        url: m.url,
        created_at: m.created_at,
        extra: m.last_changed_at
          ? `上次变更: ${formatRelativeTime(m.last_changed_at)}`
          : "监控中",
      }),
    );
    items.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return items;
  }, [feeds, monitors]);

  const addFeedMutation = useMutation({
    mutationFn: async (data: { url: string; title?: string }) => {
      const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return localFeeds.save({
        id,
        url: data.url,
        title: data.title,
        created_at: new Date().toISOString(),
      } as Feed);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      setNewUrl("");
      setNewTitle("");
    },
  });

  const addMonitorMutation = useMutation({
    mutationFn: (data: { url: string; label: string; css_selector: string }) =>
      api.post<PageMonitor>("/page-monitors", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["page-monitors"] });
      setNewUrl("");
      setNewTitle("");
    },
    onError: (e) => {
      const msg = (e as Error).message ?? "";
      if (msg.includes("offline") || msg.includes("not in online mode")) {
        addToast("服务器未连接，网页监控需要服务在线", "warn");
      } else {
        addToast(`添加失败: ${msg}`, "error");
      }
    },
  });

  const deleteFeedMutation = useMutation({
    mutationFn: (id: string) => localFeeds.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feeds"] }),
  });

  const refreshFeedMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<{ fetched: number; inserted: number }>(`/feeds/${id}/refresh`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      addToast(`已刷新: 新增 ${data.inserted} 条`, "info");
    },
    onError: (e) => {
      const msg = (e as Error).message ?? "";
      if (msg.includes("offline") || msg.includes("not in online mode")) {
        addToast("服务器未连接，刷新需要服务在线", "warn");
      } else {
        addToast(`刷新失败: ${msg}`, "error");
      }
    },
  });

  const deleteMonitorMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/page-monitors/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["page-monitors"] }),
  });

  function handleDelete(id: string, type: "rss" | "monitor") {
    if (type === "rss") deleteFeedMutation.mutate(id);
    else deleteMonitorMutation.mutate(id);
  }

  function handleAdd() {
    const url = newUrl.trim();
    if (!url) return;
    if (isRSSUrl(url)) {
      addFeedMutation.mutate({ url, title: newTitle.trim() || undefined });
    } else {
      addMonitorMutation.mutate({
        url,
        label: newTitle.trim() || url,
        css_selector: "body",
      });
    }
  }

  const selectedItem = selectedFeedId
    ? unified.find((u) => {
        if (selectedFeedId.startsWith("monitor:"))
          return (
            u.id === selectedFeedId.replace("monitor:", "") &&
            u.type === "monitor"
          );
        return u.id === selectedFeedId && u.type === "rss";
      })
    : null;

  const feedsLoading = useDelayedPending(feedsPending);
  const monitorsLoading = useDelayedPending(monitorsPending);
  const loading = (feedsLoading && !feeds) || (monitorsLoading && !monitors);
  const isError = feedsError || monitorsError;
  const isOfflineBanner = feedsOffline || monitorsOffline;

  if (loading) {
    // 仍然渲染 header + 添加表单 + skeleton 列表, 不返整页 Skeleton
    return (
      <>
        <PageLayout
          subtitle={tr("feeds.title")}
          title={tr("feeds.title")}
          description={tr("feeds.description")}
        >
          <FadeIn>
            <div className="card space-y-3">
              <div className="flex gap-2">
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder={tr("feeds.urlPlaceholder")}
                  className="input flex-1"
                />
                <button
                  onClick={handleAdd}
                  disabled
                  className="btn-primary gap-2"
                >
                  <Plus size={16} /> 订阅
                </button>
              </div>
            </div>
          </FadeIn>
          <div className="mt-6 grid grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} variant="rect" height={100} />
            ))}
          </div>
        </PageLayout>
      </>
    );
  }
  if (isError) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <CardError
          message="数据加载失败"
          onRetry={() => {
            refetchFeeds();
            refetchMonitors();
          }}
        />
      </div>
    );
  }

  // Offline 模式: 顶部 banner 提示, 继续渲染 IDB 数据 (defaultData=localFeeds.data)
  const offlineBanner = isOfflineBanner ? (
    <OfflineBanner
      message={
        feedsOffline
          ? "未连接 server, 显示本地信息源数据"
          : "未连接 server, 部分数据来自本地"
      }
      onRetry={() => {
        refetchFeeds();
        refetchMonitors();
      }}
      className="mb-4"
    />
  ) : null;

  const detectedType = newUrl.trim()
    ? isRSSUrl(newUrl.trim())
      ? "rss"
      : "web"
    : null;

  return (
    <>
      {offlineBanner}
      <PageLayout
        subtitle="信息源"
        title="信息源"
        description="输入 RSS 链接或网页 URL，自动识别并订阅。"
      >
        {/* Add form */}
        <FadeIn>
          <div className="card space-y-3">
            <div className="flex gap-2">
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="输入 RSS / 网页 URL，按 Enter 订阅"
                className="input flex-1"
              />
              <button
                onClick={handleAdd}
                disabled={!newUrl.trim() || addFeedMutation.isPending}
                className="btn-primary gap-2"
              >
                <Plus size={16} /> 订阅
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="名称（可选）"
                className="input max-w-[200px]"
              />
              {detectedType && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                    detectedType === "rss"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-violet-50 text-violet-700"
                  }`}
                >
                  {detectedType === "rss" ? (
                    <Rss size={12} />
                  ) : (
                    <Globe size={12} />
                  )}
                  {detectedType === "rss" ? tr("feeds.rssParse") : tr("feeds.pageMonitor")}
                </span>
              )}
            </div>
          </div>

          {/* How it works */}
          <div className="grid grid-cols-2 gap-3 my-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Rss size={13} className="text-emerald-600" />
                <span className="text-[12px] font-semibold text-emerald-800">
                  RSS 解析
                </span>
              </div>
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                URL 以 .xml .rss 结尾或含 /feed 路径时自动识别。后台每{" "}
                <strong>15 分钟</strong> 抓取一次，新文章自动入库。
              </p>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Globe size={13} className="text-violet-600" />
                <span className="text-[12px] font-semibold text-violet-800">
                  网页监控
                </span>
              </div>
              <p className="text-[11px] text-violet-700 leading-relaxed">
                普通网页 URL 自动创建页面监控。后台每 <strong>15 分钟</strong>{" "}
                检测变化，检测到变化后生成摘要条目。
              </p>
            </div>
          </div>
        </FadeIn>

        {/* Unified list — RSS 用轻量卡片, page monitor 用 PageMonitorCard (含状态 + 编辑) */}
        {unified.length > 0 ? (
          <StaggerList
            className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3"
            staggerKey="list"
          >
            {unified.map((item) => (
              <StaggerItem key={item.id}>
                {item.type === "monitor" ? (
                  (() => {
                    const m = (monitors ?? []).find((mm) => mm.id === item.id);
                    if (!m) return null;
                    return (
                      <PageMonitorCard monitor={m} onOpen={setSelectedFeedId} />
                    );
                  })()
                ) : (
                  <motion.div
                    className="card group cursor-pointer"
                    onClick={() => setSelectedFeedId(item.id)}
                    whileHover={{ y: -2, scale: 1.005 }}
                    whileTap={{ scale: 0.99 }}
                    transition={{
                      duration: m.duration.base / 1000,
                      ease: m.easing.out,
                    }}
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Rss size={14} className="text-emerald-500 shrink-0" />
                        <h3 className="text-sm font-medium text-[var(--color-text-primary)] line-clamp-2">
                          {item.title}
                        </h3>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            refreshFeedMutation.mutate(item.id);
                          }}
                          disabled={refreshFeedMutation.isPending}
                          className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-accent)] disabled:opacity-50"
                          title="立即刷新"
                        >
                          <RefreshCw
                            size={13}
                            className={
                              refreshFeedMutation.isPending
                                ? "animate-spin"
                                : ""
                            }
                          />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(item.id, item.type);
                          }}
                          className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-muted)] truncate">
                      {item.url}
                    </p>
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} />{" "}
                        {formatRelativeTime(item.created_at)}
                      </span>
                      {item.extra && (
                        <span className="inline-flex items-center gap-1 text-[var(--color-accent)]">
                          <Eye size={11} /> {item.extra}
                        </span>
                      )}
                    </div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={12} /> 原文
                    </a>
                  </motion.div>
                )}
              </StaggerItem>
            ))}
          </StaggerList>
        ) : (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-bg)]">
              <Rss size={32} className="text-[var(--color-text-muted)]" />
            </div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              暂无订阅
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              输入 RSS 链接或网页 URL 开始订阅
            </p>
          </div>
        )}
      </PageLayout>

      <SlideOver
        open={selectedFeedId !== null}
        onClose={() => setSelectedFeedId(null)}
        title={selectedItem?.title ?? "详情"}
      >
        {selectedFeedId && (
          <FeedItemDetail
            feedId={selectedFeedId}
            onBack={() => setSelectedFeedId(null)}
          />
        )}
      </SlideOver>
    </>
  );
}
