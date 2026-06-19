import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Calendar,
  Cpu,
  Radio,
  Rss,
  Server,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { useSessionStore } from "@/stores/session";
import { useT } from "@/lib/i18n";
import { HomeAmbient } from "@/components/effects/HomeAmbient";

const QUICK_ACTION_KEYS = [
  {
    to: "/feeds",
    icon: Rss,
    status: "ready",
    labelKey: "home.command.quick.feeds.label",
    descKey: "home.command.quick.feeds.desc",
  },
  {
    to: "/system",
    icon: Cpu,
    status: "stable",
    labelKey: "home.command.quick.system.label",
    descKey: "home.command.quick.system.desc",
  },
  {
    to: "/vms",
    icon: Server,
    status: "mock",
    labelKey: "home.command.quick.vms.label",
    descKey: "home.command.quick.vms.desc",
  },
  {
    to: "/schedule",
    icon: Calendar,
    status: "today",
    labelKey: "home.command.quick.schedule.label",
    descKey: "home.command.quick.schedule.desc",
  },
];

const TIMELINE_KEYS = [
  { event: "arona.ready", textKey: "home.command.timeline.aronaReady" },
  {
    event: "memory.summarized",
    textKey: "home.command.timeline.memorySummarized",
  },
  { event: "rss.updated", textKey: "home.command.timeline.rssUpdated" },
  { event: "presence.idle", textKey: "home.command.timeline.presenceIdle" },
];

// 时间偏移 (秒) — 相对于当前时间, 计算每个 event 的"今天 HH:MM".
// 真实数据由 /api/events SSE 推送, 这里给一个相对当前时间的合理展示.
const TIMELINE_OFFSETS_SEC = [0, 3 * 60, 6 * 60, 10 * 60];

function formatTimelineTime(
  offsetSec: number,
  t: (key: string, args?: Record<string, string | number>) => string,
): string {
  if (offsetSec === 0) return t("home.command.timeline.now");
  const d = new Date(Date.now() - offsetSec * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;
  return t("home.command.timeline.todayAt", { time });
}

function AronaOrb({
  state,
}: {
  state: "idle" | "focused" | "thinking" | "error";
}) {
  return (
    <div className={cn("arona-orb", `arona-orb--${state}`)} aria-hidden="true">
      <div className="arona-orb__ring" />
      <div className="arona-orb__core" />
      <span className="arona-orb__particle arona-orb__particle--one" />
      <span className="arona-orb__particle arona-orb__particle--two" />
      <span className="arona-orb__particle arona-orb__particle--three" />
    </div>
  );
}

function ContextPanel() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const sessions = useSessionStore((s) => s.sessions);

  return (
    <aside className="arona-panel p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-arona-deep)]">
            {t("home.command.context.title")}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
            {t("home.command.context.panelTitle")}
          </h2>
        </div>
        <Radio className="text-[var(--color-arona-blue)]" size={20} />
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-[22px] bg-white/65 p-4">
          <p className="text-xs text-[var(--color-text-muted)]">
            {t("home.command.context.currentUser")}
          </p>
          <p className="mt-1 font-medium text-[var(--color-text-primary)]">
            {user?.display_name ?? t("home.command.context.userFallback")}
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {t("home.command.context.intro")}
          </p>
        </div>

        <div className="grid gap-3">
          {[
            {
              label: t("home.command.context.recentMemory"),
              value:
                sessions[0]?.title ??
                t("home.command.context.recentMemoryFallback"),
            },
            {
              label: t("home.command.context.todaySchedule"),
              value: t("home.command.context.todayScheduleFallback"),
            },
            {
              label: t("home.command.context.systemSummary"),
              value: t("home.command.context.systemSummaryFallback"),
            },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="border-t border-[var(--color-border-subtle)] pt-3"
            >
              <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
              <p className="mt-1 text-sm text-[var(--color-text-primary)]">
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

export function HomeCommandPage() {
  const t = useT();
  const [orbState, setOrbState] = useState<
    "idle" | "focused" | "thinking" | "error"
  >("idle");

  return (
    <div className="arona-page min-h-full overflow-hidden bg-[var(--color-bg)] p-4 sm:p-6 lg:p-8">
      <HomeAmbient />

      <div className="relative mx-auto flex max-w-[1480px] flex-col gap-5">
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div
            className="arona-hero p-6 sm:p-8 lg:p-10"
            onMouseEnter={() => setOrbState("focused")}
            onMouseLeave={() => setOrbState("idle")}
          >
            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/85 px-3 py-1.5 text-xs font-medium text-[var(--color-arona-deep)] shadow-[var(--shadow-arona-1)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--color-arona-cyan)]" />
                  {t("home.command.badge")}
                </div>
                <h1 className="mt-6 max-w-3xl text-[clamp(2.4rem,6vw,5.8rem)] font-black leading-[0.95] tracking-[-0.065em] text-[var(--color-text-primary)] text-balance">
                  {t("home.command.hero.title")}
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--color-text-secondary)] sm:text-lg">
                  {t("home.command.hero.subtitle")}
                </p>
              </div>

              <div className="flex justify-center xl:justify-end">
                <AronaOrb state={orbState} />
              </div>
            </div>
          </div>

          <ContextPanel />
        </section>

        <section
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"
          aria-label={t("home.command.quickActions.aria")}
        >
          {QUICK_ACTION_KEYS.map(
            ({ to, icon: Icon, status, labelKey, descKey }) => (
              <Link key={to} to={to} className="arona-action-card group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-[var(--color-sky-soft)] text-[var(--color-arona-deep)] transition-transform duration-300 group-hover:scale-105">
                    <Icon size={20} />
                  </div>
                  <span className="rounded-full bg-white/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                    {status}
                  </span>
                </div>
                <h2 className="mt-4 font-semibold text-[var(--color-text-primary)]">
                  {t(labelKey)}
                </h2>
                <p className="mt-1 min-h-[40px] text-sm leading-5 text-[var(--color-text-secondary)]">
                  {t(descKey)}
                </p>
                <div className="mt-4 flex items-center gap-1 text-xs font-medium text-[var(--color-arona-deep)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                  {t("home.command.open")}
                  <ArrowRight size={13} />
                </div>
              </Link>
            ),
          )}
        </section>

        <section className="arona-panel p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-arona-deep)]">
                {t("home.command.timeline.title")}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
                {t("home.command.timeline.subtitle")}
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <Activity size={14} />
              {t("home.command.timeline.busStandby")}
            </div>
          </div>

          <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {TIMELINE_KEYS.map((item, idx) => (
              <div
                key={`${item.event}-${idx}`}
                className="rounded-[20px] border border-[var(--color-border-subtle)] bg-white/58 p-4 transition-colors hover:border-[var(--color-arona-cyan)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-[var(--color-text-muted)]">
                    {formatTimelineTime(TIMELINE_OFFSETS_SEC[idx], t)}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-arona-blue)]" />
                </div>
                <p className="mt-3 font-mono text-xs text-[var(--color-arona-deep)]">
                  {item.event}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {t(item.textKey)}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
