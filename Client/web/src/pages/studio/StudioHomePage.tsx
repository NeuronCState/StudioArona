import { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Cloud, ServerOff } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useConnectionStore } from '@/stores/connection';
import { api } from '@/lib/api/client';
import { useSchedules, useFeeds, useWeather } from '@/lib/db/hooks';
import type { VM } from '@/types/contracts';
import type { LocalSchedule } from '@/lib/db';
import { CardSkeleton, CardError } from '@javis/ui-kit';
import { ScheduleTile } from './tiles/ScheduleTile';
import { WeatherTile } from './tiles/WeatherTile';
import { SystemTile } from './tiles/SystemTile';
import { RSSTile } from './tiles/RSSTile';

import { onUIAction } from '@/lib/ui-actions';
import type { UIAction } from '@/types/ui-actions';
import { FocusSidebar } from '@/components/studio/FocusSidebar';
import { FocusToggle } from '@/components/studio/FocusToggle';
import { useFocusModeStore } from '@/stores/focus-mode';

type StudioMode = 'dashboard' | 'chat';

type TransitionPhase = 'idle' | 'dashboard-to-chat' | 'chat-to-dashboard';

function adaptSchedule(schedules: LocalSchedule[]) {
  return schedules.slice(0, 6).map((s) => {
    const due = new Date(s.startAt);
    const now = Date.now();
    return {
      id: s.id,
      title: s.title,
      time: due.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      isPast: due.getTime() < now,
      isCurrent: Math.abs(due.getTime() - now) < 3_600_000,
    };
  });
}

function adaptRSS(feeds: Array<{ id: string; title?: string; createdAt: number; created_at?: string }>) {
  return feeds.slice(0, 6).map((f) => {
    const created = f.createdAt ?? (f.created_at ? new Date(f.created_at).getTime() : Date.now());
    const diff = Date.now() - created;
    const hours = Math.round(diff / 3_600_000);
    const timeAgo =
      hours < 1 ? '刚刚' : hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
    return { id: f.id, title: f.title ?? '', timeAgo };
  });
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function StudioHomePage() {
  const user = useAuthStore((s) => s.user);
  const focusMode = useFocusModeStore((s) => s.focusMode);
  const focusSidebarOpen = useFocusModeStore((s) => s.focusSidebarOpen);
  const setFocusMode = useFocusModeStore((s) => s.setFocusMode);
  const setFocusSidebarOpen = useFocusModeStore((s) => s.setFocusSidebarOpen);
  const toggleFocusSidebar = useFocusModeStore((s) => s.toggleFocusSidebar);
  const [mode] = useState<StudioMode>('dashboard');
  const [phase] = useState<TransitionPhase>('idle');
  // 中心按钮 → focusMode = true + 自动拉起 FocusSidebar
  const enterFocus = useCallback(() => {
    setFocusMode(true);
    setFocusSidebarOpen(true);
  }, [setFocusMode, setFocusSidebarOpen]);
  // Esc 退出 (同时清 messages 让中央提示在下次重新显示, 但保留 chat 内容供后续展示)
  const exitFocus = useCallback(() => setFocusMode(false), [setFocusMode]);

  // 4 磁贴: 本地优先 (IDB 缓存), 连接 server 时后台 sync
  const { data: weather, isLoading: weatherLoading, error: weatherErr } = useWeather();
  const weatherError = weatherErr instanceof Error ? weatherErr.message : null;

  // VM 走 server, 离线时显示"未连接" (工作室服务需要 server)
  const effectiveMode = useConnectionStore(s => s.effectiveMode());
  const vmsOnline = effectiveMode === 'online';

  const queryClient = useQueryClient();
  // Real-time data sync: backend broadcasts data.changed → invalidate queries
  useEffect(() => {
    return onUIAction('data.changed', (action: UIAction) => {
      if (action.type !== 'data.changed') return;
      queryClient.invalidateQueries({ queryKey: [action.resource] });
    });
  }, [queryClient]);

  const {
    data: scheduleData,
    isLoading: schedLoading,
    isError: schedError,
    error: schedErr,
    refetch: refetchSched,
  } = useSchedules();

  const {
    data: feedData,
    isLoading: feedsLoading,
    isError: feedsError,
    error: feedsErr,
    refetch: refetchFeeds,
  } = useFeeds();

  // VM 仍走 server (工作室服务, 需连接)
  const {
    data: vms,
    isLoading: vmsLoading,
    isError: vmsError,
    error: vmsErr,
    refetch: refetchVms,
  } = useQuery({
    queryKey: ['vms'],
    queryFn: () => api.get<VM[]>('/api/vms'),
    staleTime: 30_000,
  });

  const greeting = useMemo(() => getGreeting(), []);
  const dateStr = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    [],
  );
  // focus mode 时, 4 磁贴/中心按钮 都不 unmount, 让 z:20 矩形盖过去 (不淡出)
  // 视觉: focus 起来 0.55s 涨到位, 中间始终有底层在, 矩形盖住它们
  const isDashboard = mode === 'dashboard';
  // studio-stage 的 data-mode: 保持在 'dashboard' 即使 focusMode, 这样磁贴定位规则
  // ([data-mode='dashboard'] .tile-*) 继续匹配, 磁贴留在原位被 z:20 的 focus-stage 盖住
  const stageMode: StudioMode | 'focus' = focusMode ? 'dashboard' : mode;

  const scheduleEvents = useMemo(() => {
    if (!scheduleData) return [];
    return adaptSchedule(scheduleData);
  }, [scheduleData]);

  const rssItems = useMemo(() => {
    if (!feedData) return [];
    return adaptRSS(feedData);
  }, [feedData]);

  // Esc 退出 focus mode
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        exitFocus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode, exitFocus]);

  return (
    <>
    <div
      className="studio-page relative flex h-full flex-col px-6 pt-5 pb-4"
      data-focus-mode={focusMode ? 'true' : 'false'}
      data-focus-sidebar-open={focusSidebarOpen ? 'true' : 'false'}
    >
      <header className={`studio-home-header mb-5 shrink-0 ${isDashboard ? 'is-visible' : ''}`}>
        <div className="flex items-baseline justify-between">
          <h1
            className="text-2xl font-semibold tracking-tight text-stone-800"
            style={{ fontFamily: 'var(--studio-font-serif)' }}
          >
            {greeting}, {user?.display_name || 'there'}
          </h1>
          <p className="text-xs text-stone-400">{dateStr}</p>
        </div>
      </header>

      <div
        className="studio-stage relative min-h-0 flex-1"
        data-mode={stageMode}
        data-phase={phase}
      >
        <div className="tile-layer" aria-hidden={!isDashboard} style={{ pointerEvents: focusMode ? 'none' : 'auto' }}>
          <div className="tile-shell tile-schedule">
            {schedLoading ? (
              <CardSkeleton variant="list" count={3} />
            ) : schedError ? (
              <CardError message={schedErr?.message} onRetry={() => refetchSched()} />
            ) : (
              <ScheduleTile events={scheduleEvents} />
            )}
          </div>
          <div className="tile-shell tile-weather">
            {weatherLoading ? (
              <CardSkeleton variant="list" count={4} />
            ) : weatherError ? (
              <CardError message={weatherError} onRetry={() => window.location.reload()} />
            ) : weather ? (
              <WeatherTile
                city={weather.city}
                temperature={weather.temperature}
                condition={weather.condition}
                humidity={weather.humidity}
                windSpeed={weather.windSpeed}
                windDirection={weather.windDirection}
                feelsLike={weather.feelsLike}
                uvIndex={weather.uvIndex}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <Cloud size={32} className="text-stone-300" />
                <p className="text-sm text-stone-500">暂无天气数据</p>
                <p className="text-xs text-stone-400">连接 server 后获取</p>
              </div>
            )}
          </div>
          <div className="tile-shell tile-system">
            {vmsLoading ? (
              <CardSkeleton variant="list" count={3} />
            ) : !vmsOnline ? (
              // 离线: 工作室服务 (VMS/NAS/HA) 明确提示未连接, 不让用户重试
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <ServerOff size={32} className="text-stone-300" />
                <p className="text-sm text-stone-500">未连接 server</p>
                <p className="text-xs text-stone-400">工作室服务需连接后查看</p>
              </div>
            ) : vmsError ? (
              <CardError message={vmsErr?.message} onRetry={() => refetchVms()} />
            ) : (
              <SystemTile vms={vms ?? []} />
            )}
          </div>
          <div className="tile-shell tile-rss">
            {feedsLoading ? (
              <CardSkeleton variant="list" count={3} />
            ) : feedsError ? (
              <CardError message={feedsErr?.message} onRetry={() => refetchFeeds()} />
            ) : (
              <RSSTile items={rssItems} />
            )}
          </div>
        </div>

        {/* Center action button — focus mode 起始点
            focus 期间不 unmount, pointer-events 锁掉, 让 z:20 矩形盖住 (不淡出) */}
        <button
          className="center-voice-btn"
          aria-label="打开阿洛娜专注面板"
          type="button"
          onClick={enterFocus}
          aria-hidden={focusMode}
          tabIndex={focusMode ? -1 : 0}
          style={{
            pointerEvents: focusMode ? 'none' : 'auto',
          }}
        >
          <img src="/voice-btn.png" alt="阿洛娜专注" />
        </button>

        {/* Focus mode — Phase 1: 圆环从中心 160×160 涨到右侧主区 (无圆角矩形)
            起点: 中心 160×160 (圆角 50%)
            终点: x:240 y:0 width:calc(100vw-240) height:100vh (无圆角, 盖 4 磁贴)
            动画: width/height 同时变 (像水波纹扩散), 无 spring 回弹
            framer 技巧: 用 transform 写位移 (x/y), 不用 left/top, 避免插值冲突
            240 = StudioSidebar 宽度 (跟 FocusSidebar 240 一致)
            portal 到 body 避免 .studio-page 的 translate 动画创建 containing block */}
        {createPortal(
          <AnimatePresence>
            {focusMode && (
              <motion.div
                key="focus-stage"
                className="focus-stage"
                initial={{
                  width: 160,
                  height: 160,
                  x: 'calc(50vw + 40px)',  // 按钮中心(50vw+120) - 半宽(80) = 50vw+40
                  y: 'calc(50vh - 80px)',
                  borderRadius: 9999,
                }}
                animate={{
                  width: 'calc(100vw - 240px)',
                  height: '100vh',
                  x: 240,  // 贴着 StudioSidebar 右缘 (240 = sidebar 宽)
                  y: 0,
                  borderRadius: 0,
                }}
                exit={{
                  width: 160,
                  height: 160,
                  x: 'calc(50vw + 40px)',
                  y: 'calc(50vh - 80px)',
                  borderRadius: 9999,
                }}
                transition={{
                  duration: 0.55,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{ background: 'var(--color-bg)' }}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}

        {/* Focus mode — Phase 2.1: 中央文字提示 (圆环涨到位才出现, 发第一条消息后消失)
            portal 到 body 避免 .studio-page 的 translate 动画创建 containing block */}
        {/* Focus mode — 中央提示已迁到 FocusSidebar 内部 (新对话按钮附近) */}
      </div>
    </div>

      {/* FocusSidebar — portal 到 body 避免 transform 影响 fixed 定位 */}
      {createPortal(
        <FocusSidebar
          open={focusMode && focusSidebarOpen}
          onClose={() => toggleFocusSidebar()}
        />,
        document.body,
      )}

      {/* FocusToggle — portal 到 body 避免 transform 影响 fixed 定位 */}
      {createPortal(
        <FocusToggle
          visible={focusMode}
          open={focusSidebarOpen}
          onToggle={() => toggleFocusSidebar()}
        />,
        document.body,
      )}
    </>
  );
}
