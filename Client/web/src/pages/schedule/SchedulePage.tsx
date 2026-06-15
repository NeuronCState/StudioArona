import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, Clock, MapPin, Plus, Pencil, X, Trash2, CalendarClock, CalendarRange, Save } from 'lucide-react';
import { api } from '@/lib/api/client';
import { EmptyState, Button, Badge, Skeleton, CardError } from '@javis/ui-kit';
import { cn } from '@/lib/utils';
import { motion as m } from '@/lib/motion';
import { Drawer } from '@/components/ui/Drawer';
import { Calendar as CalendarPicker } from '@/components/ui/Calendar';

interface ScheduleEvent {
  id: string;
  title: string;
  body?: string;
  starts_at: string;
  location?: string;
  source: string;
}

function toISOLocal(datetimeLocal: string): string {
  if (!datetimeLocal) return '';
  const d = new Date(datetimeLocal.includes('T') && !datetimeLocal.includes('Z') ? datetimeLocal + ':00' : datetimeLocal);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

function toDatetimeLocal(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ScheduleSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Skeleton width={150} height={24} />
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} variant="rect" height={72} />
      ))}
    </div>
  );
}

function groupByDate(events: ScheduleEvent[]) {
  const groups: Record<string, ScheduleEvent[]> = {};
  for (const e of events) {
    const d = new Date(e.starts_at);
    const key = d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
    (groups[key] ??= []).push(e);
  }
  return groups;
}

/**
 * ScheduleEventForm — 全屏 sheet 内部的两列布局:
 *  左侧: 大日历选日期
 *  右侧: 日程详情表单
 */
function ScheduleEventForm({
  initialDate,
  initialEvent,
  onSubmit,
  onCancel,
  isPending,
  submitLabel = '保存',
}: {
  initialDate?: string; // ISO date (yyyy-mm-dd)
  initialEvent?: { title: string; body?: string; starts_at: string; location?: string };
  onSubmit: (data: { title: string; body: string; starts_at: string; location: string }) => void;
  onCancel: () => void;
  isPending: boolean;
  submitLabel?: string;
}) {
  // 右侧表单 state
  const [title, setTitle] = useState(initialEvent?.title ?? '');
  const [body, setBody] = useState(initialEvent?.body ?? '');
  const [startsAt, setStartsAt] = useState(() => {
    if (initialEvent?.starts_at) return toDatetimeLocal(initialEvent.starts_at);
    if (initialDate) return `${initialDate}T09:00`;
    return '';
  });
  const [location, setLocation] = useState(initialEvent?.location ?? '');

  // 左侧日历选中的日期 (单独 state, 不直接绑 startsAt)
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    if (initialEvent?.starts_at) return toDatetimeLocal(initialEvent.starts_at).split('T')[0];
    if (initialDate) return initialDate;
    return null;
  });

  const handleCalendarChange = (iso: string) => {
    setSelectedDate(iso);
    // 选新日期时, 保留时间(若有), 换日期部分
    const oldTime = startsAt && startsAt.includes('T') ? startsAt.split('T')[1] : '09:00';
    setStartsAt(`${iso}T${oldTime}`);
  };

  const canSubmit = title.trim().length > 0 && startsAt.length > 0;

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[360px_1fr]">
      {/* 左侧: 大日历 */}
      <div className="flex flex-col border-b border-stone-700/50 p-6 md:border-b-0 md:border-r">
        <div className="mb-4">
          <h3 className="font-serif text-base font-semibold text-stone-100">选择日期</h3>
          <p className="mt-1 text-xs text-stone-400">
            {selectedDate
              ? new Date(selectedDate).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
              : '点日历选一天'}
          </p>
        </div>
        <div className="flex-1">
          <CalendarPicker
            value={selectedDate}
            onChange={handleCalendarChange}
            variant="dark"
            initialMonth={selectedDate ? new Date(selectedDate) : new Date()}
          />
        </div>
      </div>

      {/* 右侧: 详情表单 */}
      <div className="flex flex-col p-6">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="font-serif text-base font-semibold text-stone-100">日程详情</h3>
          <button
            onClick={onCancel}
            className="rounded-md p-1.5 text-stone-400 hover:bg-stone-800 hover:text-stone-100 transition-colors"
            title="取消"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pr-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-400">
              标题 <span className="text-rose-400">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="日程标题"
              className="w-full rounded-lg border border-stone-700 bg-stone-800/60 px-3 py-2 text-sm text-stone-100 placeholder-stone-500 transition-colors focus:border-amber-500 focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-400">
              时间 <span className="text-rose-400">*</span>
            </label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => {
                setStartsAt(e.target.value);
                const datePart = e.target.value.split('T')[0];
                if (datePart) setSelectedDate(datePart);
              }}
              className="w-full rounded-lg border border-stone-700 bg-stone-800/60 px-3 py-2 text-sm text-stone-100 transition-colors focus:border-amber-500 focus:outline-none scheme-dark"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-400">
              地点
            </label>
            <div className="relative">
              <MapPin size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="可选"
                className="w-full rounded-lg border border-stone-700 bg-stone-800/60 py-2 pl-8 pr-3 text-sm text-stone-100 placeholder-stone-500 transition-colors focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-400">
              备注
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="可选"
              className="w-full resize-none rounded-lg border border-stone-700 bg-stone-800/60 px-3 py-2 text-sm text-stone-100 placeholder-stone-500 transition-colors focus:border-amber-500 focus:outline-none"
              rows={4}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-stone-700/50 pt-4">
          <button
            onClick={onCancel}
            className="rounded-lg border border-stone-700 px-4 py-2 text-sm font-medium text-stone-300 transition-colors hover:bg-stone-800"
          >
            取消
          </button>
          <button
            onClick={() => {
              if (!canSubmit) return;
              const iso = toISOLocal(startsAt);
              if (!iso) return;
              onSubmit({ title, body, starts_at: iso, location });
            }}
            disabled={!canSubmit || isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>保存中…</>
            ) : (
              <>
                <Save size={14} />
                {submitLabel}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SchedulePage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'upcoming' | 'all'>('upcoming');
  const [showAdd, setShowAdd] = useState(false);
  const [addInitialDate, setAddInitialDate] = useState<string | undefined>(undefined);

  const {
    data: events,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['schedules', view],
    queryFn: () =>
      api.get<ScheduleEvent[]>(`/schedules${view === 'upcoming' ? '?upcoming=true' : ''}`),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInitialEvent, setEditInitialEvent] = useState<ScheduleEvent | null>(null);

  const addMutation = useMutation({
    mutationFn: (data: { title: string; body: string; starts_at: string; location: string }) =>
      api.post('/schedules', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      setShowAdd(false);
      setAddInitialDate(undefined);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; title: string; body?: string; starts_at: string; location?: string }) =>
      api.patch(`/schedules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      setEditingId(null);
      setEditInitialEvent(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/schedules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  });

  function startEdit(e: ScheduleEvent) {
    setEditingId(e.id);
    setEditInitialEvent(e);
  }

  if (isLoading) return <ScheduleSkeleton />;

  if (isError) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <CardError message={error?.message} onRetry={() => refetch()} />
      </div>
    );
  }

  const grouped = events ? groupByDate(events) : {};

  return (
    <div className="studio-page mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">Schedule</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--color-text-primary)]">
            日程计划
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            阿洛娜会帮你整理今日安排，并把计划带回对话上下文。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setAddInitialDate(undefined); setShowAdd(true); }} className="btn-primary gap-2">
            <Plus size={16} />
            添加日程
          </button>
          <div className="relative inline-flex rounded-full bg-white/60 p-1 shadow-[var(--shadow-1)]">
            {([
              { id: 'upcoming' as const, label: '即将到来', Icon: CalendarClock },
              { id: 'all' as const, label: '全部', Icon: CalendarRange },
            ]).map(({ id, label, Icon }) => {
              const active = view === id;
              return (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={cn(
                    'relative z-10 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'text-white'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="scheduleViewPill"
                      className="absolute inset-0 rounded-full bg-[var(--color-accent)] shadow-[var(--shadow-1)]"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon size={12} className="relative z-10" />
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 新建日程全屏 sheet */}
      <Drawer
        open={showAdd}
        onClose={() => { setShowAdd(false); setAddInitialDate(undefined); }}
        from="top"
        variant="sheet"
        title="新建日程"
      >
        <ScheduleEventForm
          initialDate={addInitialDate}
          onSubmit={(data) => addMutation.mutate(data)}
          onCancel={() => { setShowAdd(false); setAddInitialDate(undefined); }}
          isPending={addMutation.isPending}
          submitLabel="添加到日程"
        />
      </Drawer>

      {/* 编辑日程全屏 sheet */}
      <Drawer
        open={editingId !== null}
        onClose={() => { setEditingId(null); setEditInitialEvent(null); }}
        from="top"
        variant="sheet"
        title="编辑日程"
      >
        {editInitialEvent && (
          <ScheduleEventForm
            initialEvent={editInitialEvent}
            onSubmit={(data) => {
              if (!editingId) return;
              updateMutation.mutate({ id: editingId, ...data });
            }}
            onCancel={() => { setEditingId(null); setEditInitialEvent(null); }}
            isPending={updateMutation.isPending}
            submitLabel="保存"
          />
        )}
      </Drawer>

      <AnimatePresence mode="wait" initial={false}>
        {!events || events.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: m.duration.fast / 1000, ease: m.easing.out }}
          >
            <EmptyState
              icon={<CalendarIcon size={40} />}
              title="暂无日程"
              description={'对阿洛娜说「帮我安排xxx」，我会自动创建日程。'}
              action={
                <Button size="sm" onClick={() => { setAddInitialDate(undefined); setShowAdd(true); }}>
                  添加日程
                </Button>
              }
            />
          </motion.div>
        ) : (
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: m.duration.fast / 1000, ease: m.easing.out }}
            className="space-y-8"
          >
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date}>
                <h3 className="mb-3 font-serif text-sm font-medium text-[var(--color-text-primary)]">
                  {date}
                </h3>
                <div className="space-y-2">
                  {items.map((event) => {
                    const d = new Date(event.starts_at);
                    const time = d.toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const isPast = d.getTime() < Date.now();
                    return (
                      <div
                        key={event.id}
                        className={cn(
                          'group flex items-start gap-4 rounded-[24px] border bg-[var(--color-surface-glass)] p-4 shadow-[var(--shadow-1)] backdrop-blur-xl',
                          isPast && 'opacity-50',
                        )}
                      >
                        <div className="flex flex-col items-center pt-0.5">
                          <Clock size={14} className="text-[var(--color-text-muted)]" />
                          <span className="mt-1 text-xs font-medium text-[var(--color-text-secondary)]">
                            {time}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-[var(--color-text-primary)]">
                              {event.title}
                            </p>
                            {event.source === 'agent' && <Badge variant="accent">Arona</Badge>}
                          </div>
                          {event.body && (
                            <p className="mt-1 text-xs text-[var(--color-text-secondary)] line-clamp-2">
                              {event.body}
                            </p>
                          )}
                          {event.location && (
                            <div className="mt-1 flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                              <MapPin size={10} />
                              {event.location}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={(ev) => { ev.stopPropagation(); startEdit(event); }}
                          className="shrink-0 rounded-lg p-1.5 text-[var(--color-text-muted)] opacity-0 hover:bg-[var(--color-bg)] hover:text-[var(--color-accent)] group-hover:opacity-100 transition-all"
                          title="编辑"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={(ev) => { ev.stopPropagation(); deleteMutation.mutate(event.id); }}
                          className="shrink-0 rounded-lg p-1.5 text-[var(--color-text-muted)] opacity-0 hover:bg-[var(--color-bg)] hover:text-[var(--color-error)] group-hover:opacity-100 transition-all"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
