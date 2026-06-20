import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { isOfflineError } from "@/lib/api/error-helpers";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Cloud, ServerOff } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { useConnectionStore } from "@/stores/connection";
import { api } from "@/lib/api/client";
import type { Feed, VM } from "@/types/contracts";
import { useLocalResource } from "@/lib/storage/useLocalResource";
import {
  scheduleResourceConfig,
  type ScheduleDocument,
} from "@/lib/resources/schedules";
import { feedResourceConfig } from "@/lib/resources/feeds";
import { useDashboardWeather } from "@/lib/resources/weather";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { CardSkeleton, CardError } from "@javis/ui-kit";
import { ScheduleTile } from "./tiles/ScheduleTile";
import { WeatherTile } from "./tiles/WeatherTile";
import { SystemTile } from "./tiles/SystemTile";
import { RSSTile } from "./tiles/RSSTile";

import { onUIAction } from "@/lib/ui-actions";
import type { UIAction } from "@/types/ui-actions";
import { FocusSidebar } from "@/components/studio/FocusSidebar";
import { FocusToggle } from "@/components/studio/FocusToggle";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { useFocusModeStore } from "@/stores/focus-mode";
import { useFocusChatsStore } from "@/stores/focus-chats";
import { useLocaleStore } from "@/stores/locale";
import { useT } from "@/lib/i18n";

type StudioMode = "dashboard" | "chat";

type TransitionPhase = "idle" | "dashboard-to-chat" | "chat-to-dashboard";

interface FocusOrigin {
  x: number | string;
  y: number | string;
  width: number;
  height: number;
}

const DEFAULT_FOCUS_ORIGIN: FocusOrigin = {
  x: "calc(50vw + 40px)",
  y: "calc(50vh - 80px)",
  width: 160,
  height: 160,
};

function adaptSchedule(schedules: ScheduleDocument[]) {
  return schedules.slice(0, 6).map((s) => {
    const due = new Date(s.starts_at);
    const now = Date.now();
    return {
      id: s.id,
      title: s.title,
      time: due.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      isPast: due.getTime() < now,
      isCurrent: Math.abs(due.getTime() - now) < 3_600_000,
    };
  });
}

function adaptRSS(feeds: Feed[], locale: "zh" | "en") {
  return feeds.slice(0, 6).map((f) => {
    const created = new Date(f.created_at).getTime();
    const diff = Date.now() - created;
    const hours = Math.round(diff / 3_600_000);
    let timeAgo: string;
    if (hours < 1) {
      timeAgo = locale === "zh" ? "刚刚" : "just now";
    } else if (hours < 24) {
      timeAgo = locale === "zh" ? `${hours} 小时前` : `${hours}h ago`;
    } else {
      const days = Math.round(hours / 24);
      timeAgo = locale === "zh" ? `${days} 天前` : `${days}d ago`;
    }
    return { id: f.id, title: f.title ?? "", timeAgo };
  });
}

function getGreeting(t: (key: string) => string): string {
  const hour = new Date().getHours();
  if (hour < 12) return t("home.studio.greeting.morning");
  if (hour < 18) return t("home.studio.greeting.afternoon");
  return t("home.studio.greeting.evening");
}

export function StudioHomePage() {
  const t = useT();
  const reducedMotion = useReducedMotion();
  const locale = useLocaleStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const focusMode = useFocusModeStore((s) => s.focusMode);
  const focusSidebarOpen = useFocusModeStore((s) => s.focusSidebarOpen);
  const setFocusMode = useFocusModeStore((s) => s.setFocusMode);
  const setFocusSidebarOpen = useFocusModeStore((s) => s.setFocusSidebarOpen);
  const toggleFocusSidebar = useFocusModeStore((s) => s.toggleFocusSidebar);
  const activeChatId = useFocusChatsStore((s) => s.activeChatId);
  const ensureActiveChat = useFocusChatsStore((s) => s.ensureActiveChat);
  const [mode] = useState<StudioMode>("dashboard");
  const [phase] = useState<TransitionPhase>("idle");
  const centerButtonRef = useRef<HTMLButtonElement>(null);
  const [focusOrigin, setFocusOrigin] = useState<FocusOrigin>(DEFAULT_FOCUS_ORIGIN);
  const captureFocusOrigin = useCallback(() => {
    const rect = centerButtonRef.current?.getBoundingClientRect();
    if (!rect) return false;
    setFocusOrigin({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    });
    return true;
  }, []);
  // 中心按钮 → focusMode = true + 自动拉起 FocusSidebar
  const enterFocus = useCallback(() => {
    captureFocusOrigin();
    ensureActiveChat();
    setFocusMode(true);
    setFocusSidebarOpen(true);
  }, [captureFocusOrigin, ensureActiveChat, setFocusMode, setFocusSidebarOpen]);
  // Esc / 关闭按钮退出，保留会话内容供下次继续。
  const exitFocus = useCallback(() => {
    if (!captureFocusOrigin()) {
      setFocusMode(false);
      return;
    }
    // 先把最新按钮位置提交给退出动画，下一帧再卸载 focus stage。
    window.requestAnimationFrame(() => setFocusMode(false));
  }, [captureFocusOrigin, setFocusMode]);

  // 4 磁贴: 本地优先 (IDB 缓存), 连接 server 时后台 sync
  // 天气: 主动拿一次浏览器定位, 不管返回什么都直接当当前位置用, 不再有假数据兜底
  const {
    coords,
    refresh: refreshLocation,
    isFetching: isLocating,
  } = useGeolocation();
  const {
    data: weather,
    isLoading: weatherLoading,
    error: weatherErr,
  } = useDashboardWeather(coords);
  const weatherError = weatherErr instanceof Error ? weatherErr.message : null;

  // VM 走 server, 离线时显示"未连接" (工作室服务需要 server)
  const effectiveMode = useConnectionStore((s) => s.effectiveMode());
  const vmsOnline = effectiveMode === "online";

  const queryClient = useQueryClient();
  // Real-time data sync: backend broadcasts data.changed → invalidate queries
  useEffect(() => {
    return onUIAction("data.changed", (action: UIAction) => {
      if (action.type !== "data.changed") return;
      queryClient.invalidateQueries({ queryKey: [action.resource] });
    });
  }, [queryClient]);

  const scheduleResource = useLocalResource(scheduleResourceConfig("upcoming"));
  const {
    data: scheduleData,
    isLoading: schedLoading,
    isError: schedError,
    error: schedErr,
    refetch: refetchSched,
  } = scheduleResource.query;

  const feedResource = useLocalResource(feedResourceConfig());
  const {
    data: feedData,
    isLoading: feedsLoading,
    isError: feedsError,
    error: feedsErr,
    refetch: refetchFeeds,
  } = feedResource.query;

  // VM 仍走 server (工作室服务, 需连接)
  const {
    data: vms,
    isLoading: vmsLoading,
    isError: vmsError,
    error: vmsErr,
    refetch: refetchVms,
  } = useQuery({
    queryKey: ["vms"],
    queryFn: () => api.get<VM[]>("/vms"),
    staleTime: 30_000,
  });

  const greeting = useMemo(() => getGreeting(t), [t]);
  const dateStr = useMemo(() => {
    const localeTag = locale === "zh" ? "zh-CN" : "en-US";
    return new Date().toLocaleDateString(localeTag, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }, [locale]);
  // focus mode 时, 4 磁贴/中心按钮 都不 unmount, 让 z:20 矩形盖过去 (不淡出)
  // 视觉: focus 起来 0.55s 涨到位, 中间始终有底层在, 矩形盖住它们
  const isDashboard = mode === "dashboard";
  // studio-stage 的 data-mode: 保持在 'dashboard' 即使 focusMode, 这样磁贴定位规则
  // ([data-mode='dashboard'] .tile-*) 继续匹配, 磁贴留在原位被 z:20 的 focus-stage 盖住
  const stageMode: StudioMode | "focus" = focusMode ? "dashboard" : mode;

  const scheduleEvents = useMemo(() => {
    if (!scheduleData) return [];
    return adaptSchedule(scheduleData);
  }, [scheduleData]);

  const rssItems = useMemo(() => {
    if (!feedData) return [];
    return adaptRSS(feedData, locale);
  }, [feedData, locale]);

  // Esc 退出 focus mode
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        exitFocus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode, exitFocus]);

  return (
    <>
      <div
        className="studio-page relative flex h-full flex-col px-6 pt-5 pb-4"
        data-focus-mode={focusMode ? "true" : "false"}
        data-focus-sidebar-open={focusSidebarOpen ? "true" : "false"}
      >
        <header
          className={`studio-home-header mb-5 shrink-0 ${isDashboard ? "is-visible" : ""}`}
        >
          <div className="flex items-baseline justify-between">
            <h1
              className="text-2xl font-semibold tracking-tight text-stone-800"
              style={{ fontFamily: "var(--studio-font-serif)" }}
            >
              {greeting},{" "}
              {user?.display_name || t("home.studio.greeting.fallback")}
            </h1>
            <p className="text-xs text-stone-400">{dateStr}</p>
          </div>
        </header>

        <div
          className="studio-stage relative min-h-0 flex-1"
          data-mode={stageMode}
          data-phase={phase}
        >
          <div
            className="tile-layer"
            aria-hidden={!isDashboard}
            style={{ pointerEvents: focusMode ? "none" : "auto" }}
          >
            <motion.div
              className="tile-shell tile-schedule"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: 0 }}
            >
              {schedLoading ? (
                <CardSkeleton variant="list" count={3} />
              ) : schedError ? (
                <CardError
                  offline={isOfflineError(schedErr)}
                  message={schedErr?.message}
                  onRetry={() => refetchSched()}
                />
              ) : (
                <ScheduleTile events={scheduleEvents} />
              )}
            </motion.div>
            <motion.div
              className="tile-shell tile-weather"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              {weatherLoading ? (
                <CardSkeleton variant="list" count={4} />
              ) : weatherError ? (
                <CardError
                  offline={isOfflineError(weatherError)}
                  message={weatherError}
                  onRetry={() => window.location.reload()}
                />
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
                  onRelocate={refreshLocation}
                  isRelocating={isLocating}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                  <Cloud size={32} className="text-stone-300" />
                  <p className="text-sm text-stone-500">
                    {t("home.studio.weatherEmpty.title")}
                  </p>
                  <p className="text-xs text-stone-400">
                    {t("home.studio.weatherEmpty.hint")}
                  </p>
                </div>
              )}
            </motion.div>
            <motion.div
              className="tile-shell tile-system"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              {vmsLoading ? (
                <CardSkeleton variant="list" count={3} />
              ) : !vmsOnline ? (
                // 离线: 工作室服务 (VMS/NAS/HA) 明确提示未连接, 不让用户重试
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                  <ServerOff size={32} className="text-stone-300" />
                  <p className="text-sm text-stone-500">
                    {t("home.studio.serverOffline.title")}
                  </p>
                  <p className="text-xs text-stone-400">
                    {t("home.studio.serverOffline.hint")}
                  </p>
                </div>
              ) : vmsError ? (
                <CardError
                  offline={isOfflineError(vmsErr)}
                  message={vmsErr?.message}
                  onRetry={() => refetchVms()}
                />
              ) : (
                <SystemTile vms={vms ?? []} />
              )}
            </motion.div>
            <motion.div
              className="tile-shell tile-rss"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              {feedsLoading ? (
                <CardSkeleton variant="list" count={3} />
              ) : feedsError ? (
                <CardError
                  offline={isOfflineError(feedsErr)}
                  message={feedsErr?.message}
                  onRetry={() => refetchFeeds()}
                />
              ) : (
                <RSSTile items={rssItems} />
              )}
            </motion.div>
          </div>

          {/* Center action button — focus mode 起始点
            focus 期间不 unmount, pointer-events 锁掉, 让 z:20 矩形盖住 (不淡出) */}
          <button
            ref={centerButtonRef}
            className="center-voice-btn"
            aria-label={t("home.studio.centerButton.aria")}
            type="button"
            onClick={enterFocus}
            aria-hidden={focusMode}
            tabIndex={focusMode ? -1 : 0}
            style={{
              pointerEvents: focusMode ? "none" : "auto",
            }}
          >
            <img src="/voice-btn.png" alt={t("home.studio.centerButton.alt")} />
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
                  initial={
                    reducedMotion
                      ? false
                      : {
                          width: focusOrigin.width,
                          height: focusOrigin.height,
                          x: focusOrigin.x,
                          y: focusOrigin.y,
                          borderRadius: 9999,
                        }
                  }
                  animate={{
                    width: "calc(100vw - 240px)",
                    height: "100vh",
                    x: 240, // 贴着 StudioSidebar 右缘 (240 = sidebar 宽)
                    y: 0,
                    borderRadius: 0,
                  }}
                  exit={{
                    width: focusOrigin.width,
                    height: focusOrigin.height,
                    x: focusOrigin.x,
                    y: focusOrigin.y,
                    borderRadius: 9999,
                  }}
                  transition={{
                    duration: reducedMotion ? 0 : 0.55,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  style={{ background: "var(--color-bg)" }}
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

      {activeChatId &&
        createPortal(
          <AgentPanel open={focusMode} onClose={exitFocus} sessionId={activeChatId} />,
          document.body,
        )}
    </>
  );
}
