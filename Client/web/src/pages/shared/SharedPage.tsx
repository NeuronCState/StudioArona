import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isOfflineError } from "@/lib/api/error-helpers";
import { api } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth";
import type { Feed, Schedule } from "@/types/contracts";
import { formatRelativeTime, formatCountdown } from "@/lib/utils";
import { CardSkeleton, CardError, CardEmpty } from "@javis/ui-kit";
import {
  Rss,
  Calendar,
  Pin,
  Pencil,
  Trash2,
  Shield,
  Users,
  Globe,
  ChevronDown,
} from "lucide-react";

type PermissionLevel = "owner" | "all" | "public";

interface PermissionInfo {
  level: PermissionLevel;
  label: string;
  icon: typeof Shield;
  description: string;
}

const permissionMap: Record<PermissionLevel, PermissionInfo> = {
  owner: {
    level: "owner",
    label: "仅创建者可改",
    icon: Shield,
    description: "只有创建该内容的成员可以编辑",
  },
  all: {
    level: "all",
    label: "全员可改",
    icon: Users,
    description: "所有工作室成员都可以编辑",
  },
  public: {
    level: "public",
    label: "公开可见",
    icon: Globe,
    description: "所有人可见，仅管理员可编辑",
  },
};

export function SharedPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  const {
    data: feeds,
    isLoading: feedsLoading,
    isError: feedsError,
    error: feedsErr,
    refetch: refetchFeeds,
  } = useQuery({
    queryKey: ["feeds", "shared"],
    queryFn: () => api.get<Feed[]>("/feeds?scope=shared"),
  });

  const {
    data: schedules,
    isLoading: schedLoading,
    isError: schedError,
    error: schedErr,
    refetch: refetchSched,
  } = useQuery({
    queryKey: ["schedules", "shared"],
    queryFn: () => api.get<Schedule[]>("/schedules?scope=shared"),
  });

  const deleteFeedMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/feeds/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds", "shared"] });
      queryClient.invalidateQueries({ queryKey: ["feeds", "local"] });
    },
  });

  const isError = feedsError || schedError;
  const firstError = feedsErr ?? schedErr;

  if (isError) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <CardError
          offline={isOfflineError(firstError)}
          message={firstError?.message}
          onRetry={() => {
            refetchFeeds();
            refetchSched();
          }}
        />
      </div>
    );
  }

  // Derive permissions: admin gets all-edit, members get contextual
  const feedPermissions: Record<string, PermissionLevel> = {};
  feeds?.forEach((f) => {
    if (isAdmin) feedPermissions[f.id] = "all";
    else if (f.user_id === user?.id) feedPermissions[f.id] = "owner";
    else feedPermissions[f.id] = "public";
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h2 className="text-lg font-semibold text-text-primary">共享信息源</h2>

      {/* Permission legend — always visible (结构骨架), 不受 loading 影响 */}
      <div className="card space-y-3">
        <h3 className="text-sm font-medium text-text-primary">编辑权限</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Object.values(permissionMap).map((perm) => (
            <div
              key={perm.level}
              className="flex items-start gap-2 rounded-lg bg-surface p-3"
            >
              <perm.icon size={16} className="text-accent shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-text-primary">
                  {perm.label}
                </p>
                <p className="text-xs text-text-muted">{perm.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Announcement area — always visible */}
      <div className="card border-accent/30 bg-accent-soft/30">
        <div className="flex items-center gap-2 text-accent">
          <Pin size={14} />
          <span className="text-xs font-medium">工作室公告</span>
        </div>
        <p className="mt-2 text-sm text-text-secondary">暂无公告</p>
      </div>

      {/* Shared schedules */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-text-secondary">
            <Calendar size={16} />
            <span className="text-xs font-medium">共享日程</span>
          </div>
          <button className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary">
            <ChevronDown size={14} />
            筛选
          </button>
        </div>
        {schedLoading ? (
          <CardSkeleton variant="list" count={3} />
        ) : schedules && schedules.length > 0 ? (
          <div className="space-y-2">
            {schedules.map((s) => {
              const perm = isAdmin
                ? "all"
                : s.user_id === user?.id
                  ? "owner"
                  : "public";
              const pInfo = permissionMap[perm as PermissionLevel];
              return (
                <div
                  key={s.id}
                  className="card group flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-primary">
                        {s.title}
                      </span>
                      {s.source === "agent" && (
                        <span className="rounded bg-surface px-1.5 py-0.5 text-2xs text-text-muted">
                          Arona
                        </span>
                      )}
                    </div>
                    {s.body && (
                      <p className="mt-1 text-xs text-text-secondary line-clamp-1">
                        {s.body}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-accent">
                      {formatCountdown(s.starts_at)}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <pInfo.icon size={14} className="text-text-muted" />
                      <span className="text-xs text-text-muted hidden sm:inline">
                        {pInfo.label}
                      </span>
                      {perm !== "public" && (
                        <div className="flex gap-1">
                          <button
                            className="rounded p-0.5 text-text-muted hover:text-accent"
                            aria-label="编辑"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            className="rounded p-0.5 text-text-muted hover:text-red-500"
                            aria-label="删除"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <CardEmpty hint="暂无共享日程" />
        )}
      </section>

      {/* Shared feeds */}
      <section>
        <div className="mb-3 flex items-center gap-2 text-text-secondary">
          <Rss size={16} />
          <span className="text-xs font-medium">共享订阅</span>
        </div>
        {feedsLoading ? (
          <CardSkeleton variant="grid" count={3} />
        ) : feeds && feeds.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {feeds.map((feed) => {
              const perm = feedPermissions[feed.id] ?? "public";
              const pInfo = permissionMap[perm];
              return (
                <div
                  key={feed.id}
                  className="card group relative overflow-hidden"
                >
                  {/* Permission indicator strip */}
                  <div
                    className={`absolute left-0 top-0 h-full w-1 ${
                      perm === "all"
                        ? "bg-accent"
                        : perm === "owner"
                          ? "bg-zinc-300"
                          : "bg-border"
                    }`}
                  />
                  <div className="pl-2">
                    <h3 className="text-sm font-medium text-text-primary line-clamp-1">
                      {feed.title}
                    </h3>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-xs text-text-muted">
                        {formatRelativeTime(feed.created_at)}
                      </p>
                      <pInfo.icon size={12} className="text-text-muted" />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-text-muted">
                        {pInfo.label}
                      </span>
                      {perm !== "public" && (
                        <button
                          onClick={() => deleteFeedMutation.mutate(feed.id)}
                          className="rounded p-0.5 text-text-muted opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                          aria-label="删除"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <CardEmpty hint="暂无共享订阅" />
        )}
      </section>
    </div>
  );
}
