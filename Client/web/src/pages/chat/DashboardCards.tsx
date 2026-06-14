import { Calendar, Rss, Cpu, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Schedule, Feed, SystemMetrics } from '@/types/contracts';
import { formatCountdown, formatRelativeTime } from '@/lib/utils';
import { useSessionStore } from '@/stores/session';
import { CardSkeleton, CardError } from '@javis/ui-kit';

export function DashboardCards() {
  const setWakeState = useSessionStore((s) => s.setWakeState);

  const {
    data: schedules,
    isLoading: schedLoading,
    isError: schedError,
    refetch: refetchSched,
  } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => api.get<Schedule[]>('/schedules?scope=personal'),
  });

  const {
    data: feeds,
    isLoading: feedsLoading,
    isError: feedsError,
    refetch: refetchFeeds,
  } = useQuery({
    queryKey: ['feeds'],
    queryFn: () => api.get<Feed[]>('/feeds?scope=personal'),
  });

  const {
    data: metrics,
    isLoading: metricsLoading,
    isError: metricsError,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ['system-metrics'],
    queryFn: () => api.get<SystemMetrics>('/system/metrics'),
  });

  const handleFakeWake = () => {
    setWakeState('waking');
    setTimeout(() => setWakeState('active'), 1200);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">今日概览</h2>
        <button
          onClick={handleFakeWake}
          className="btn-secondary gap-2 text-xs"
          data-testid="fake-wake-btn"
        >
          <Zap size={14} className="text-accent" />
          假装唤醒
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Schedules */}
        <div className="card">
          <div className="mb-3 flex items-center gap-2 text-text-secondary">
            <Calendar size={16} />
            <span className="text-xs font-medium">近期日程</span>
          </div>
          {schedLoading ? (
            <CardSkeleton variant="list" count={2} />
          ) : schedError ? (
            <div className="py-2">
              <CardError message="加载失败" onRetry={() => refetchSched()} />
            </div>
          ) : schedules && schedules.length > 0 ? (
            <div className="space-y-2">
              {schedules.slice(0, 3).map((s) => {
                const isUrgent = new Date(s.starts_at).getTime() - Date.now() < 24 * 3_600_000;
                return (
                  <div key={s.id} className="flex items-baseline justify-between">
                    <span className="truncate text-sm text-text-primary">{s.title}</span>
                    <span
                      className={`ml-2 shrink-0 font-mono text-xs ${isUrgent ? 'text-accent font-semibold' : 'text-text-muted'}`}
                    >
                      {formatCountdown(s.starts_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-text-muted">暂无日程</p>
          )}
        </div>

        {/* RSS */}
        <div className="card">
          <div className="mb-3 flex items-center gap-2 text-text-secondary">
            <Rss size={16} />
            <span className="text-xs font-medium">最新 RSS</span>
          </div>
          {feedsLoading ? (
            <CardSkeleton variant="list" count={2} />
          ) : feedsError ? (
            <div className="py-2">
              <CardError message="加载失败" onRetry={() => refetchFeeds()} />
            </div>
          ) : feeds && feeds.length > 0 ? (
            <div className="space-y-2">
              {feeds.slice(0, 3).map((f) => (
                <div key={f.id} className="flex items-baseline justify-between">
                  <span className="truncate text-sm text-text-primary">{f.title}</span>
                  <span className="ml-2 shrink-0 text-xs text-text-muted">
                    {formatRelativeTime(f.created_at)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted">暂无订阅</p>
          )}
        </div>

        {/* System status */}
        <div className="card">
          <div className="mb-3 flex items-center gap-2 text-text-secondary">
            <Cpu size={16} />
            <span className="text-xs font-medium">系统状态</span>
          </div>
          {metricsLoading ? (
            <CardSkeleton variant="compact" count={3} />
          ) : metricsError ? (
            <div className="py-2">
              <CardError message="加载失败" onRetry={() => refetchMetrics()} />
            </div>
          ) : metrics ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-text-primary">CPU</span>
                <span className="font-mono text-xs text-text-muted">
                  {Math.round(
                    metrics.cpu_cores.reduce((a, c) => a + c.util_pct, 0) /
                      metrics.cpu_cores.length,
                  )}
                  %
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-text-primary">内存</span>
                <span className="font-mono text-xs text-text-muted">
                  {Math.round((metrics.mem_used_mb / metrics.mem_total_mb) * 100)}%
                </span>
              </div>
              {metrics.gpus.length > 0 && (
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-text-primary">GPU</span>
                  <span className="font-mono text-xs text-text-muted">
                    {Math.round(metrics.gpus[0].util_pct)}%
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-text-muted">无数据</p>
          )}
        </div>
      </div>
    </div>
  );
}
