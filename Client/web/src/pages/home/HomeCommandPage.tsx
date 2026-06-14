import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Brain,
  Calendar,
  Cpu,
  Radio,
  Rss,
  Server,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useSessionStore } from '@/stores/session';
import { HomeAmbient } from '@/components/effects/HomeAmbient';

const quickActions = [
  { to: '/memory', icon: Brain, label: '记忆库', desc: '查看阿洛娜记住的偏好与事件', status: 'synced' },
  { to: '/feeds', icon: Rss, label: '情报站', desc: 'RSS 文章、摘要与订阅源', status: 'ready' },
  { to: '/system', icon: Cpu, label: '工作室状态', desc: 'CPU、内存、网络与事件流', status: 'stable' },
  { to: '/vms', icon: Server, label: 'VM 控制台', desc: '启动、停止和查看虚拟机', status: 'mock' },
  { to: '/schedule', icon: Calendar, label: '日程计划', desc: '今日安排与阿洛娜规划', status: 'today' },
];

const timeline = [
  { time: '刚刚', event: 'arona.ready', text: '阿洛娜已同步首页上下文' },
  { time: '20:41', event: 'memory.summarized', text: '最近会话摘要已写入记忆' },
  { time: '20:38', event: 'rss.updated', text: 'RSS 情报站完成一次刷新' },
  { time: '20:31', event: 'presence.idle', text: '工作室感知处于待机状态' },
];

function AronaOrb({ state }: { state: 'idle' | 'focused' | 'thinking' | 'error' }) {
  return (
    <div className={cn('arona-orb', `arona-orb--${state}`)} aria-hidden="true">
      <div className="arona-orb__ring" />
      <div className="arona-orb__core" />
      <span className="arona-orb__particle arona-orb__particle--one" />
      <span className="arona-orb__particle arona-orb__particle--two" />
      <span className="arona-orb__particle arona-orb__particle--three" />
    </div>
  );
}

function ContextPanel() {
  const user = useAuthStore((s) => s.user);
  const sessions = useSessionStore((s) => s.sessions);

  return (
    <aside className="arona-panel p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-arona-deep)]">Context</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">阿洛娜的同步面板</h2>
        </div>
        <Radio className="text-[var(--color-arona-blue)]" size={20} />
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-[22px] bg-white/65 p-4">
          <p className="text-xs text-[var(--color-text-muted)]">当前用户</p>
          <p className="mt-1 font-medium text-[var(--color-text-primary)]">{user?.display_name ?? '老师'}</p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">阿洛娜已准备好处理对话、记忆与工作室任务。</p>
        </div>

        <div className="grid gap-3">
          {[
            ['最近记忆', sessions[0]?.title ?? '暂无新的会话记忆'],
            ['今日日程', '等待同步日程事件'],
            ['系统摘要', 'CPU / Memory / RSS worker 正常'],
          ].map(([label, value]) => (
            <div key={label} className="border-t border-[var(--color-border-subtle)] pt-3">
              <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
              <p className="mt-1 text-sm text-[var(--color-text-primary)]">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

export function HomeCommandPage() {
  const [orbState, setOrbState] = useState<'idle' | 'focused' | 'thinking' | 'error'>('idle');

  return (
    <div className="arona-page min-h-full overflow-hidden bg-[var(--color-bg)] p-4 sm:p-6 lg:p-8">
      <HomeAmbient />

      <div className="relative mx-auto flex max-w-[1480px] flex-col gap-5">
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div
            className="arona-hero p-6 sm:p-8 lg:p-10"
            onMouseEnter={() => setOrbState('focused')}
            onMouseLeave={() => setOrbState('idle')}
          >
            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/85 px-3 py-1.5 text-xs font-medium text-[var(--color-arona-deep)] shadow-[var(--shadow-arona-1)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--color-arona-cyan)]" />
                  Arona 阿洛娜 · online
                </div>
                <h1 className="mt-6 max-w-3xl text-[clamp(2.4rem,6vw,5.8rem)] font-black leading-[0.95] tracking-[-0.065em] text-[var(--color-text-primary)] text-balance">
                  老师，今天需要我帮忙吗？
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--color-text-secondary)] sm:text-lg">
                  阿洛娜已经同步了记忆、日程、RSS 情报和工作室状态。你可以直接开始对话，或让她进入语音模式陪你处理任务。
                </p>
              </div>

              <div className="flex justify-center xl:justify-end">
                <AronaOrb state={orbState} />
              </div>
            </div>

          </div>

          <ContextPanel />
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label="阿洛娜快捷功能">
          {quickActions.map(({ to, icon: Icon, label, desc, status }) => (
            <Link key={to} to={to} className="arona-action-card group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-[var(--color-sky-soft)] text-[var(--color-arona-deep)] transition-transform duration-300 group-hover:scale-105">
                  <Icon size={20} />
                </div>
                <span className="rounded-full bg-white/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                  {status}
                </span>
              </div>
              <h2 className="mt-4 font-semibold text-[var(--color-text-primary)]">{label}</h2>
              <p className="mt-1 min-h-[40px] text-sm leading-5 text-[var(--color-text-secondary)]">{desc}</p>
              <div className="mt-4 flex items-center gap-1 text-xs font-medium text-[var(--color-arona-deep)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                打开
                <ArrowRight size={13} />
              </div>
            </Link>
          ))}
        </section>

        <section className="arona-panel p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-arona-deep)]">Live Timeline</p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">实时事件流</h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <Activity size={14} />
              WebSocket bus standby
            </div>
          </div>

          <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {timeline.map((item) => (
              <div key={`${item.time}-${item.event}`} className="rounded-[20px] border border-[var(--color-border-subtle)] bg-white/58 p-4 transition-colors hover:border-[var(--color-arona-cyan)]">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-[var(--color-text-muted)]">{item.time}</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-arona-blue)]" />
                </div>
                <p className="mt-3 font-mono text-xs text-[var(--color-arona-deep)]">{item.event}</p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{item.text}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
