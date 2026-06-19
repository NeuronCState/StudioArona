import { useState } from "react";
import { isOfflineError } from "@/lib/api/error-helpers";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ExternalLink,
  Clock,
  FileText,
  Loader2,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { api } from "@/lib/api/client";
import { formatRelativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { CardSkeleton, CardError } from "@javis/ui-kit";

interface FeedItem {
  id: string;
  title: string;
  link?: string;
  summary?: string;
  published_at?: string;
  read: boolean;
}

interface FeedItemDetailProps {
  feedId: string;
  onBack: () => void;
}

function extractContentPath(summary?: string): string | null {
  if (!summary) return null;
  const m = summary.match(/<!-- content_path:(.+?) -->/);
  return m ? m[1] : null;
}

function cleanSummary(summary?: string): string {
  if (!summary) return "";
  return summary.replace(/<!-- content_path:.+? -->/, "").trim();
}

export function FeedItemDetail({
  feedId,
  onBack: _onBack,
}: FeedItemDetailProps) {
  const t = useT();
  const [readingItem, setReadingItem] = useState<FeedItem | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const isMonitor = feedId.startsWith("monitor:");
  const monitorId = isMonitor ? feedId.replace("monitor:", "") : null;

  const {
    data: items,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["feed-items", feedId],
    queryFn: () => {
      if (monitorId) {
        // monitor event 已包含 server 端抽取的 summary, 不再走 article-content
        return api.get<FeedItem[]>(`/page-monitors/${monitorId}/events`);
      }
      return api.get<FeedItem[]>(`/feeds/${feedId}/items`);
    },
    enabled: !!feedId,
  });

  // 取得文章 HTML: 先看 content_path 缓存; 没有则 lazy extract via /api/article-content.
  // Monitor event 跳过 (server 已抽取好, 直接显示 summary).
  const { data: pageHtml } = useQuery({
    queryKey: ["page-content", readingItem?.id, readingItem?.link],
    queryFn: async () => {
      if (!readingItem) return null;
      if (isMonitor) return null;
      const cp = extractContentPath(readingItem.summary);
      const token = useAuthStore.getState().accessToken ?? "";
      const authHeaders: Record<string, string> = token
        ? { Authorization: `Bearer ${token}` }
        : {};

      if (cp) {
        const res = await fetch(`/api/page-content/${encodeURIComponent(cp)}`, {
          headers: authHeaders,
        });
        if (res.ok) return res.text();
      }
      // RSS 抓的没 content_path → 触发 lazy extract
      if (readingItem.link) {
        setExtracting(true);
        setExtractError(null);
        try {
          const params = new URLSearchParams({
            url: readingItem.link,
            feed: feedId,
            guid: readingItem.id,
          });
          const res = await fetch(`/api/article-content?${params}`, {
            headers: authHeaders,
          });
          if (res.ok) return await res.text();
          setExtractError(t("feed.extractFailed", { status: res.status }));
          return null;
        } finally {
          setExtracting(false);
        }
      }
      return null;
    },
    enabled: !!readingItem && !isMonitor,
  });

  if (readingItem) {
    return (
      <div className="flex flex-col h-full">
        <button
          onClick={() => setReadingItem(null)}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]"
        >
          <ArrowLeft size={16} /> {t("feed.back")}
        </button>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2 leading-snug">
          {readingItem.title}
        </h3>
        <div className="mb-3 flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
          {readingItem.published_at && (
            <span className="inline-flex items-center gap-1">
              <Clock size={11} /> {formatRelativeTime(readingItem.published_at)}
            </span>
          )}
          {readingItem.link && (
            <a
              href={readingItem.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--color-accent)] hover:underline"
            >
              <ExternalLink size={11} /> {t("feed.openOriginal")}
            </a>
          )}
        </div>
        {isMonitor ? (
          // Monitor event: 直接显示 server 端抽取的 summary (200 字以内)
          <div className="flex-1 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            {cleanSummary(readingItem.summary) || t("feed.noSummary")}
          </div>
        ) : pageHtml ? (
          <div className="flex-1 min-h-0">
            <iframe
              srcDoc={pageHtml}
              style={{ width: "100%", height: "100%", border: "none" }}
              sandbox="allow-same-origin"
              title={readingItem.title}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]">
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              {extracting ? t("feed.extracting") : t("feed.loadingContent")}
            </div>
            {extractError && (
              <p className="text-xs text-[var(--color-warn)]">
                {t("feed.extractFailedHint", { msg: extractError })}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return <CardSkeleton variant="detail" count={1} />;
  }

  if (isError) {
    return (
      <CardError
        offline={isOfflineError(error)}
        message={error?.message ?? t("feed.loadFailed")}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-3">
      {items && items.length > 0 ? (
        items.map((item) => (
          <div
            key={item.id}
            className="card group cursor-pointer hover:border-[var(--color-accent)]/30 transition-colors"
            onClick={() => setReadingItem(item)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)] leading-snug">
                  {item.title}
                </h3>
                {item.summary && (
                  <p className="mt-1.5 text-[13px] text-[var(--color-text-secondary)] leading-relaxed line-clamp-3">
                    {cleanSummary(item.summary)}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
                  {item.published_at && (
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} />{" "}
                      {formatRelativeTime(item.published_at)}
                    </span>
                  )}
                  {item.link && (
                    <span className="inline-flex items-center gap-1">
                      <ExternalLink size={11} /> {new URL(item.link).hostname}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[var(--color-accent)]">
                    <FileText size={11} /> {t("feed.read")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">
          {isMonitor ? t("feed.empty.monitor") : t("feed.empty.rss")}
        </p>
      )}
    </div>
  );
}
