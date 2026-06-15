import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api/client';
import type { VM, Schedule, Feed } from '@/types/contracts';
import { CardSkeleton, CardError } from '@javis/ui-kit';
import { ScheduleTile } from './tiles/ScheduleTile';
import { WeatherTile } from './tiles/WeatherTile';
import { SystemTile } from './tiles/SystemTile';
import { RSSTile } from './tiles/RSSTile';
import { QuickChatBar } from './tiles/QuickChatBar';
import { createSSEConnection, type SSEEvent } from '@/lib/sse-client';
import { dispatchUIAction, onUIAction } from '@/lib/ui-actions';
import type { UIAction } from '@/types/ui-actions';
import { AgentPanel } from '@/components/agent/AgentPanel';
import { FocusSidebar } from '@/components/studio/FocusSidebar';
import { FocusToggle } from '@/components/studio/FocusToggle';
import { useFocusModeStore } from '@/stores/focus-mode';

type StudioMode = 'dashboard' | 'chat';

interface WeatherData {
  city: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: string;
  windDirection?: string;
  feelsLike: number;
  uvIndex: string;
}
type TransitionPhase = 'idle' | 'dashboard-to-chat' | 'chat-to-dashboard';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

function adaptSchedule(apiSchedules: Schedule[]) {
  return apiSchedules.slice(0, 6).map((s) => {
    const due = new Date(s.starts_at);
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

function adaptRSS(feeds: Feed[]) {
  return feeds.slice(0, 6).map((f) => {
    const diff = Date.now() - new Date(f.created_at).getTime();
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
  const [mode, setMode] = useState<StudioMode>('dashboard');
  const [phase, setPhase] = useState<TransitionPhase>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const phaseTimerRef = useRef<number | null>(null);
  const replyTimerRef = useRef<number | null>(null);

  // Focus mode — 中心按钮扩散 + FocusSidebar 拉出
  const focusMode = useFocusModeStore((s) => s.focusMode);
  const setFocusMode = useFocusModeStore((s) => s.setFocusMode);
  const focusSidebarOpen = useFocusModeStore((s) => s.focusSidebarOpen);
  const toggleFocusSidebar = useFocusModeStore((s) => s.toggleFocusSidebar);

  // 单一来源: focusMode 同时驱动 AgentPanel 的 open prop.
  // 中心按钮 → focusMode = true (AgentPanel 自动展开)
  // AgentPanel 关闭 → focusMode = false
  const agentOpen = focusMode;
  const setAgentOpen = setFocusMode;

  const { data: weather, isLoading: weatherLoading, error: weatherErr } = useQuery({
    queryKey: ['weather'],
    queryFn: () => api.get<WeatherData>('/weather'),
    staleTime: 600_000,
  });
  const weatherError = weatherErr instanceof Error ? weatherErr.message : null;

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
  } = useQuery({
    queryKey: ['schedules', 'upcoming'],
    queryFn: () => api.get<Schedule[]>('/schedules?upcoming=true'),
    staleTime: 60_000,
  });

  const {
    data: feedData,
    isLoading: feedsLoading,
    isError: feedsError,
    error: feedsErr,
    refetch: refetchFeeds,
  } = useQuery({
    queryKey: ['feeds'],
    queryFn: () => api.get<Feed[]>('/feeds'),
    staleTime: 60_000,
  });

  const {
    data: vms,
    isLoading: vmsLoading,
    isError: vmsError,
    error: vmsErr,
    refetch: refetchVms,
  } = useQuery({
    queryKey: ['vms'],
    queryFn: () => api.get<VM[]>('/vms'),
    staleTime: 30_000,
  });

  const greeting = useMemo(() => getGreeting(), []);
  const dateStr = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    [],
  );
  const isDashboard = mode === 'dashboard' && !focusMode;
  const isChat = mode === 'chat' || focusMode;
  // studio-stage 的 data-mode: dashboard / chat / focus
  // focus 模式时 4 磁贴淡出, 中心按钮被 AgentPanel 接管
  const stageMode: StudioMode | 'focus' = focusMode ? 'focus' : mode;

  const scheduleEvents = useMemo(() => {
    if (!scheduleData) return [];
    return adaptSchedule(scheduleData);
  }, [scheduleData]);

  const rssItems = useMemo(() => {
    if (!feedData) return [];
    return adaptRSS(feedData);
  }, [feedData]);

  const setTimedPhase = useCallback((nextPhase: TransitionPhase, duration: number) => {
    if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
    setPhase(nextPhase);
    phaseTimerRef.current = window.setTimeout(() => {
      setPhase('idle');
      phaseTimerRef.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, isLoading]);

  useEffect(
    () => () => {
      if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
      if (replyTimerRef.current) window.clearTimeout(replyTimerRef.current);
    },
    [],
  );

  const enterChat = useCallback(() => {
    if (mode === 'chat') return;
    setTimedPhase('dashboard-to-chat', 900);
    setMode('chat');
  }, [mode, setTimedPhase]);

  const backToDashboard = useCallback(() => {
    if (mode === 'chat') {
      setTimedPhase('chat-to-dashboard', 750);
      setMode('dashboard');
    }
  }, [mode, setTimedPhase]);

  const handleSend = useCallback(
    async (content: string) => {
      enterChat();
      // Create session
      let sid: string;
      try {
        const s = await api.post<{ id: string }>('/chat/sessions');
        sid = s.id;
      } catch {
        setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: 'assistant', content: '无法连接阿洛娜' }]);
        return;
      }
      // User message
      setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', content }]);
      setIsLoading(true);
      // Assistant bubble
      let fullText = '';
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: '' }]);

      createSSEConnection(
        sid,
        content,
        (event: SSEEvent) => {
          if (event.type === 'token') {
            fullText += event.text;
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { ...next[next.length - 1], content: fullText };
              return next;
            });
          } else if (event.type === 'done') {
            setIsLoading(false);
          } else if (event.type === 'error') {
            fullText += `\n\n${event.message}`;
            setIsLoading(false);
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { ...next[next.length - 1], content: fullText };
              return next;
            });
          } else if (event.type === 'ui_action') {
            dispatchUIAction(event.action);
          }
        },
        () => setIsLoading(false),
      );
    },
    [enterChat],
  );

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
        <div className="tile-layer" aria-hidden={!isDashboard}>
          <div className="tile-shell tile-schedule" onClick={isChat ? backToDashboard : undefined}>
            {schedLoading ? (
              <CardSkeleton variant="list" count={3} />
            ) : schedError ? (
              <CardError message={schedErr?.message} onRetry={() => refetchSched()} />
            ) : (
              <ScheduleTile events={scheduleEvents} />
            )}
          </div>
          <div className="tile-shell tile-weather" onClick={isChat ? backToDashboard : undefined}>
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
            ) : null}
          </div>
          <div className="tile-shell tile-system" onClick={isChat ? backToDashboard : undefined}>
            {vmsLoading ? (
              <CardSkeleton variant="list" count={3} />
            ) : vmsError ? (
              <CardError message={vmsErr?.message} onRetry={() => refetchVms()} />
            ) : (
              <SystemTile vms={vms ?? []} />
            )}
          </div>
          <div className="tile-shell tile-rss" onClick={isChat ? backToDashboard : undefined}>
            {feedsLoading ? (
              <CardSkeleton variant="list" count={3} />
            ) : feedsError ? (
              <CardError message={feedsErr?.message} onRetry={() => refetchFeeds()} />
            ) : (
              <RSSTile items={rssItems} />
            )}
          </div>
        </div>

        {/* Center action button — opens the AgentPanel via layoutId shared element.
            When focusMode, an expanded backdrop with the same layoutId takes over,
            and framer-motion animates the morph (ring → full rectangle). */}
        <AnimatePresence mode="popLayout">
          {!focusMode && (
            <motion.button
              key="center-btn"
              layoutId="focus-ring"
              className="center-voice-btn"
              aria-label="打开阿洛娜专注面板"
              aria-expanded={focusMode}
              type="button"
              onClick={() => setAgentOpen(true)}
            >
              <img src="/voice-btn.png" alt="阿洛娜专注" />
            </motion.button>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {focusMode && (
            <motion.div
              key="focus-ring-expanded"
              layoutId="focus-ring"
              className="focus-ring-expanded"
              aria-hidden="true"
            />
          )}
        </AnimatePresence>

        <section className="conversation-stage" aria-hidden={!isChat}>
          <div ref={chatRef} className="conversation-panel">
            <div className="conversation-kicker">Today's conversation</div>
            {messages.length === 0 && (
              <p className="conversation-empty">
                Start typing below and the surrounding tiles will stay available as compact context.
              </p>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-msg ${msg.role}`}>
                {msg.content}
              </div>
            ))}
            {isLoading && (
              <div className="chat-msg assistant">
                <span className="inline-flex gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full bg-amber-400 animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="h-2 w-2 rounded-full bg-amber-400 animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="h-2 w-2 rounded-full bg-amber-400 animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Agent focus panel — diffuses out of the center button when opened.
            UI-only; data hook is mock until task 4 wires Hermes. */}
        <AgentPanel open={agentOpen} onClose={() => setAgentOpen(false)} />
      </div>

      <div className="mt-3 shrink-0">
        <QuickChatBar
          onSend={handleSend}
        />
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
