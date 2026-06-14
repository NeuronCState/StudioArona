import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, MapPin, Plus, Pencil, Check, X, Trash2, CalendarClock, CalendarRange } from 'lucide-react';
import { api } from '@/lib/api/client';
import { EmptyState, Button, Badge, Skeleton, CardError } from '@javis/ui-kit';
import { cn } from '@/lib/utils';
import { motion as m } from '@/lib/motion';

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

export function SchedulePage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'upcoming' | 'all'>('upcoming');
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [location, setLocation] = useState('');

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
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editLocation, setEditLocation] = useState('');

  const addMutation = useMutation({
    mutationFn: (data: { title: string; body: string; starts_at: string; location: string }) =>
      api.post('/schedules', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      setTitle('');
      setBody('');
      setStartsAt('');
      setLocation('');
      setShowAdd(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; title: string; body?: string; starts_at: string; location?: string }) =>
      api.patch(`/schedules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/schedules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  });

  function startEdit(e: ScheduleEvent) {
    setEditingId(e.id);
    setEditTitle(e.title);
    setEditBody(e.body ?? '');
    setEditStartsAt(e.starts_at ? toDatetimeLocal(e.starts_at) : '');
    setEditLocation(e.location ?? '');
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
    <div className="studio-page mx-auto max-w-4xl space-y-6 p-6">
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
          <button onClick={() => setShowAdd(true)} className="btn-primary gap-2">
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

      {showAdd && (
        <div className="card motion-slide-up space-y-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            提示：你也可以直接对阿洛娜说「帮我安排xxx」
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="日程标题"
            className="input"
          />
          <div className="flex gap-2">
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="input flex-1"
            />
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="地点（可选）"
              className="input flex-1"
            />
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="备注（可选）"
            className="input"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                try {
                  if (!title.trim() || !startsAt) return;
                  const iso = toISOLocal(startsAt);
                  if (!iso) return;
                  addMutation.mutate({ title, body, starts_at: iso, location });
                } catch (err) {
                  console.error('addMutation failed', err);
                }
              }}
              disabled={addMutation.isPending}
              className="btn-primary"
            >
              {addMutation.isPending ? '添加中...' : '添加'}
            </button>
            <button onClick={() => setShowAdd(false)} className="btn-secondary">
              取消
            </button>
          </div>
        </div>
      )}

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
              icon={<Calendar size={40} />}
              title="暂无日程"
              description={'对阿洛娜说「帮我安排xxx」，我会自动创建日程。'}
              action={
                <Button size="sm" onClick={() => setShowAdd(true)}>
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
                  const editing = editingId === event.id;
                  return editing ? (
                    <div key={event.id} className="card motion-slide-up space-y-3">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="日程标题"
                        className="input"
                      />
                      <div className="flex gap-2">
                        <input
                          type="datetime-local"
                          value={editStartsAt}
                          onChange={(e) => setEditStartsAt(e.target.value)}
                          className="input flex-1"
                        />
                        <input
                          value={editLocation}
                          onChange={(e) => setEditLocation(e.target.value)}
                          placeholder="地点（可选）"
                          className="input flex-1"
                        />
                      </div>
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        placeholder="备注（可选）"
                        className="input"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            try {
                              if (!editTitle.trim() || !editStartsAt) return;
                              const iso = toISOLocal(editStartsAt);
                              if (!iso) return;
                              updateMutation.mutate({
                                id: event.id,
                                title: editTitle,
                                body: editBody,
                                starts_at: iso,
                                location: editLocation,
                              });
                            } catch (err) {
                              console.error('updateMutation failed', err);
                            }
                          }}
                          disabled={updateMutation.isPending}
                          className="btn-primary gap-1.5"
                        >
                          <Check size={14} />
                          保存
                        </button>
                        <button onClick={() => setEditingId(null)} className="btn-secondary gap-1.5">
                          <X size={14} />
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
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
