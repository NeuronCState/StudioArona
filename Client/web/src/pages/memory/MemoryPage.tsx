import { useState, useMemo } from 'react';
import { isOfflineError } from "@/lib/api/error-helpers";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDelayedPending } from '@/hooks/useDelayedPending';
import {
  Search,
  Edit3,
  Trash2,
  EyeOff,
  Eye,
  Clock,
  Heart,
  ListTodo,
  Users,
  Zap,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { useLocalResource } from '@/lib/storage/useLocalResource';
import { Tabs, Badge, Skeleton, EmptyState, Button, CardError } from '@javis/ui-kit';
import { cn } from '@/lib/utils';
import { StaggerList, StaggerItem } from '@/components/motion';

// Mock types until contracts are updated
interface MemoryEntry {
  id: string;
  type: 'fact' | 'preference' | 'todo' | 'relation' | 'emotion';
  summary: string;
  detail?: string;
  source_session_id?: string;
  hit_count: number;
  enabled: boolean;
  decaying: boolean;
  created_at: string;
}

const typeMeta: Record<string, { icon: typeof Zap; label: string; color: string }> = {
  fact: { icon: Zap, label: '事实', color: 'text-[var(--color-accent)]' },
  preference: { icon: Heart, label: '偏好', color: 'text-[var(--color-error)]' },
  todo: { icon: ListTodo, label: '待办', color: 'text-[var(--color-warn)]' },
  relation: { icon: Users, label: '关系', color: 'text-blue-500' },
  emotion: { icon: Zap, label: '情绪', color: 'text-purple-500' },
};

function formatMemoryTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MemoryPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('timeline');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const {
    data: entries,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['memory-entries'],
    queryFn: () => api.get<MemoryEntry[]>('/memory/entries'),
  });

  // 本地优先 — Memory 写 storage (Tauri fs / IDB), online 时 push server (S1a endpoint)
  const localMemories = useLocalResource<MemoryEntry>({
    table: 'memories',
    queryKey: ['memory-entries', 'local'],
    serverList: () => api.get<MemoryEntry[]>('/memory/entries'),
    serverPush: (doc) => api.post<MemoryEntry>('/memory/entries', {
      type: doc.type,
      summary: doc.summary,
      detail: doc.detail,
      hit_count: doc.hit_count,
      enabled: doc.enabled,
      decaying: doc.decaying,
    }),
    serverRemove: (id) => api.delete(`/memory/entries/${id}`),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, summary }: { id: string; summary: string }) => {
      const existing = (localMemories.data ?? []).find((e) => e.id === id);
      if (!existing) return;
      return localMemories.save({ ...existing, summary });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memory-entries'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => localMemories.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memory-entries'] }),
  });

  const disableMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const existing = (localMemories.data ?? []).find((e) => e.id === id);
      if (!existing) return;
      return localMemories.save({ ...existing, enabled });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memory-entries'] }),
  });

  const filtered = useMemo(() => {
    if (!entries) return [];
    let result = entries;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) => e.summary.toLowerCase().includes(q));
    }
    if (typeFilter.size > 0) {
      result = result.filter((e) => typeFilter.has(e.type));
    }
    return result;
  }, [entries, search, typeFilter]);

  const toggleType = (t: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const stats = useMemo(() => {
    if (!entries) return null;
    const now = Date.now();
    const weekAgo = now - 7 * 86400_000;
    const thisWeek = entries.filter((e) => new Date(e.created_at).getTime() > weekAgo).length;
    const typeCount: Record<string, number> = {};
    entries.forEach((e) => {
      typeCount[e.type] = (typeCount[e.type] ?? 0) + 1;
    });
    const topTypes = Object.entries(typeCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
    const decaying = entries.filter((e) => e.decaying).length;
    return { total: entries.length, thisWeek, topTypes, decaying };
  }, [entries]);

  const loading = useDelayedPending(isPending) && !entries;

  if (isError) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <CardError offline={isOfflineError(error)} message={error?.message} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="studio-page mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">Memory</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--color-text-primary)]">
            记忆库
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            阿洛娜会把重要事实、偏好和待办整理成可维护的记忆。
          </p>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="flex flex-wrap gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <StatBadge label="总记忆" value={stats.total} />
          <StatBadge label="本周新增" value={stats.thisWeek} accent />
          <StatBadge label="衰减中" value={stats.decaying} warn={stats.decaying > 0} />
          <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
            <span>热门:</span>
            {stats.topTypes.map(([t, n]) => (
              <Badge key={t} variant="default">
                {typeMeta[t]?.label ?? t} {n}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Search & filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索记忆..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          />
        </div>
        <div className="flex gap-1">
          {Object.entries(typeMeta).map(([key, { icon: Icon, label, color }]) => (
            <button
              key={key}
              onClick={() => toggleType(key)}
              className={cn(
                'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
                typeFilter.has(key)
                  ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]',
              )}
            >
              <Icon size={12} className={color} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'timeline', label: '时间轴' },
          { id: 'grid', label: '卡片网格' },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rect" height={80} />
          ))}
        </div>
      ) : !entries ? (
        // 数据未到位, 不渲染任何内容 (避免 EmptyState → 数据 闪烁)
        null
      ) : !filtered.length ? (
        <EmptyState
          icon={<Clock size={40} />}
          title="还没有记忆"
          description="去和阿洛娜聊聊天，我会记住关于你的一切。"
          action={
            <Button size="sm" onClick={() => window.history.pushState({}, '', '/')}>
              去对话
            </Button>
          }
        />
      ) : activeTab === 'timeline' ? (
        <TimelineView
          entries={filtered}
          editingId={editingId}
          editText={editText}
          onStartEdit={(id, text) => {
            setEditingId(id);
            setEditText(text);
          }}
          onSaveEdit={(id) => {
            if (editText.trim()) updateMutation.mutate({ id, summary: editText.trim() });
            setEditingId(null);
          }}
          onCancelEdit={() => setEditingId(null)}
          setEditText={setEditText}
          onToggleDisable={(id, enabled) => disableMutation.mutate({ id, enabled: !enabled })}
          onDelete={(id) => setDeleteConfirm(id)}
        />
      ) : (
        <GridView
          entries={filtered}
          onToggleDisable={(id, enabled) => disableMutation.mutate({ id, enabled: !enabled })}
          onDelete={(id) => setDeleteConfirm(id)}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">确认删除</h3>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              这条记忆将被永久删除，不可恢复。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary text-xs">
                取消
              </button>
              <button
                onClick={() => {
                  deleteMutation.mutate(deleteConfirm);
                  setDeleteConfirm(null);
                }}
                className="rounded-lg bg-[var(--color-error)] px-4 py-2 text-xs font-medium text-white hover:opacity-90 transition-opacity"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBadge({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: number;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
      <span
        className={cn(
          'text-sm font-semibold',
          accent && 'text-[var(--color-accent)]',
          warn && 'text-[var(--color-warn)]',
          !accent && !warn && 'text-[var(--color-text-primary)]',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function TimelineView({
  entries,
  editingId,
  editText,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  setEditText,
  onToggleDisable,
  onDelete,
}: {
  entries: MemoryEntry[];
  editingId: string | null;
  editText: string;
  onStartEdit: (id: string, text: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  setEditText: (v: string) => void;
  onToggleDisable: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="relative pl-8">
      {/* Timeline line */}
      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-[var(--color-border)]" />

      <StaggerList className="space-y-6" staggerKey="page">
        {entries.map((entry) => {
          const meta = typeMeta[entry.type] ?? typeMeta.fact;
          const Icon = meta.icon;
          return (
            <StaggerItem key={entry.id}>
            <div className="group relative">
              {/* Dot on timeline */}
              <div
                className={cn(
                  'absolute -left-[21px] top-2 h-3 w-3 rounded-full border-2 border-[var(--color-surface)]',
                  entry.enabled ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-text-muted)]',
                )}
              />

              {/* Card */}
              <div
                className={cn(
                  'rounded-[24px] border bg-[var(--color-surface-glass)] p-4 shadow-[var(--shadow-1)] backdrop-blur-xl',
                  !entry.enabled && 'opacity-50',
                  entry.decaying && 'border-[var(--color-warn)]/30',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon size={14} className={meta.color} />
                    <Badge variant="default">{meta.label}</Badge>
                  </div>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {formatMemoryTime(entry.created_at)}
                  </span>
                </div>

                {editingId === entry.id ? (
                  <div className="mt-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                      rows={2}
                      autoFocus
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => onSaveEdit(entry.id)}
                        className="btn-primary text-xs py-1 px-3"
                      >
                        保存
                      </button>
                      <button onClick={onCancelEdit} className="btn-secondary text-xs py-1 px-3">
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[var(--color-text-primary)]">{entry.summary}</p>
                )}

                {/* Footer */}
                <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--color-text-muted)]">
                  <span>命中 {entry.hit_count} 次</span>
                  {entry.decaying && <span className="text-[var(--color-warn)]">衰减中</span>}
                  <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onStartEdit(entry.id, entry.summary)}
                      className="rounded p-1 hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)]"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={() => onToggleDisable(entry.id, entry.enabled)}
                      className="rounded p-1 hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)]"
                      title={entry.enabled ? '禁用' : '启用'}
                    >
                      {entry.enabled ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <button
                      onClick={() => onDelete(entry.id)}
                      className="rounded p-1 hover:bg-[var(--color-bg)] hover:text-[var(--color-error)]"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                 </div>
               </div>
             </div>
            </StaggerItem>
          );
        })}
      </StaggerList>
    </div>
  );
}

function GridView({
  entries,
  onToggleDisable,
  onDelete,
}: {
  entries: MemoryEntry[];
  onToggleDisable: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
      {entries.map((entry) => {
        const meta = typeMeta[entry.type] ?? typeMeta.fact;
        const Icon = meta.icon;
        return (
          <div
            key={entry.id}
            className={cn(
              'mb-4 break-inside-avoid rounded-[24px] border bg-[var(--color-surface-glass)] p-4 shadow-[var(--shadow-1)] backdrop-blur-xl',
              !entry.enabled && 'opacity-50',
              entry.decaying && 'border-[var(--color-warn)]/30',
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon size={14} className={meta.color} />
              <Badge variant="default">{meta.label}</Badge>
              <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">
                {formatMemoryTime(entry.created_at)}
              </span>
            </div>
            <p className="text-sm text-[var(--color-text-primary)]">{entry.summary}</p>
            <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
              <span>命中 {entry.hit_count} 次</span>
              <button
                onClick={() => onToggleDisable(entry.id, entry.enabled)}
                className="ml-auto rounded p-1 hover:bg-[var(--color-bg)]"
                title={entry.enabled ? '禁用' : '启用'}
              >
                {entry.enabled ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
              <button
                onClick={() => onDelete(entry.id)}
                className="rounded p-1 hover:bg-[var(--color-bg)] hover:text-[var(--color-error)]"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
