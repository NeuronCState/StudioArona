import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Trash2, Calendar, Rss, Server, MessageSquare, MessageSquarePlus, X } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { VM, Schedule, Feed } from '@/types/contracts';
import { useFocusChatsStore, type FocusChat } from '@/stores/focus-chats';
import { useFocusModeStore } from '@/stores/focus-mode';
import { motion as m } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

/**
 * FocusSidebar — 专注模式左侧拉出
 *
 * 布局 (240px 宽):
 * ┌────────────────────────┐
 * │ 对话历史 (60%)          │  ← 上半, 可滚
 * │ ───────                │
 * │ 日程 (≈ 13.3%)         │  ← 下半, 3 个固定高度
 * │ 信息源 RSS (≈ 13.3%)   │
 * │ 虚拟机 (≈ 13.3%)       │
 * └────────────────────────┘
 *
 * 父组件 (StudioHomePage) 控制 open 状态 + 进入/退出动画。
 * FocusToggle 触发 toggleFocusSidebar。
 */
export interface FocusSidebarProps {
  open: boolean;
  onClose: () => void;
}

type RegionKey = 'schedule' | 'feeds' | 'vms';

export function FocusSidebar({ open, onClose }: FocusSidebarProps) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          key="focus-sidebar"
          initial={{ x: -240, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -240, opacity: 0 }}
          transition={{ duration: m.duration.base / 1000, ease: m.easing.out }}
          className="focus-sidebar"
          aria-label="专注侧栏"
        >
          <FocusSidebarContent onClose={onClose} />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function FocusSidebarContent({ onClose }: { onClose: () => void }) {
  const createChat = useFocusChatsStore((s) => s.createChat);
  const setFocusMode = useFocusModeStore((s) => s.setFocusMode);
  const t = useT();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="focus-sidebar-header">
        <span className="focus-sidebar-title">专注</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="收起专注侧栏"
          className="focus-sidebar-close"
        >
          <X size={14} />
        </button>
      </div>

      {/* 新对话按钮 — FocusSidebar 内部, 拉到时才显示 */}
      <motion.button
        type="button"
        onClick={() => { createChat(); setFocusMode(true); }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: m.duration.fast / 1000, ease: m.easing.out }}
        className="sidebar-new-chat"
        title={t('sidebar.newChat')}
      >
        <MessageSquarePlus size={14} />
        <span>{t('sidebar.newChat')}</span>
      </motion.button>

      {/* History (60%) */}
      <HistoryPane />

      {/* Divider */}
      <div className="focus-sidebar-divider" />

      {/* Three regions (40% total, equal split) */}
      <RegionPane region="schedule" />
      <RegionPane region="feeds" />
      <RegionPane region="vms" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* History pane                                                       */
/* ------------------------------------------------------------------ */

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(diff / 86_400_000);
  if (days < 7) return `${days}d`;
  const date = new Date(ts);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function HistoryPane() {
  const chats = useFocusChatsStore((s) => s.chats);
  const activeChatId = useFocusChatsStore((s) => s.activeChatId);
  const setActiveChat = useFocusChatsStore((s) => s.setActiveChat);
  const renameChat = useFocusChatsStore((s) => s.renameChat);
  const deleteChat = useFocusChatsStore((s) => s.deleteChat);

  const sorted = useMemo(
    () => [...chats].sort((a, b) => b.updatedAt - a.updatedAt),
    [chats],
  );

  return (
    <div className="focus-history">
      <div className="focus-section-header">
        <MessageSquare size={12} />
        <span>对话历史</span>
        <span className="focus-section-count">{chats.length}</span>
      </div>
      <div className="focus-history-scroll">
        {sorted.length === 0 ? (
          <div className="focus-empty">
            <span>暂无对话</span>
            <span className="focus-empty-hint">点击左侧「新对话」开始</span>
          </div>
        ) : (
          <ul className="focus-chat-list">
            {sorted.map((chat) => (
              <HistoryItem
                key={chat.id}
                chat={chat}
                isActive={chat.id === activeChatId}
                onActivate={() => setActiveChat(chat.id)}
                onRename={(t) => renameChat(chat.id, t)}
                onDelete={() => deleteChat(chat.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function HistoryItem({
  chat,
  isActive,
  onActivate,
  onRename,
  onDelete,
}: {
  chat: FocusChat;
  isActive: boolean;
  onActivate: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chat.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    const t = draft.trim();
    if (t && t !== chat.title) onRename(t);
    else setDraft(chat.title);
    setEditing(false);
  }, [draft, chat.title, onRename]);

  const cancel = useCallback(() => {
    setDraft(chat.title);
    setEditing(false);
  }, [chat.title]);

  const handleClick = () => {
    if (!editing) onActivate();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setDraft(chat.title);
    setEditing(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setConfirmDelete(true);
  };

  return (
    <li
      className={cn('focus-chat-item', isActive && 'is-active')}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      title="单击切换 · 双击重命名 · 右键删除"
    >
      {editing ? (
        <input
          ref={inputRef}
          className="focus-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <span className="focus-chat-title">{chat.title}</span>
          <span className="focus-chat-time">{formatRelative(chat.updatedAt)}</span>
        </>
      )}

      <AnimatePresence>
        {isActive && !editing && (
          <motion.div
            className="focus-chat-actions"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label="重命名"
              className="focus-chat-action"
              onClick={(e) => {
                e.stopPropagation();
                setDraft(chat.title);
                setEditing(true);
              }}
            >
              <Pencil size={11} />
            </button>
            <button
              type="button"
              aria-label="删除"
              className="focus-chat-action"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(true);
              }}
            >
              <Trash2 size={11} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirm popover */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            className="focus-confirm"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="focus-confirm-text">删除「{chat.title}」?</p>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="focus-confirm-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(false);
                }}
              >
                取消
              </button>
              <button
                type="button"
                className="focus-confirm-btn is-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(false);
                  onDelete();
                }}
              >
                删除
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Region pane (schedule / feeds / vms) — empty state placeholder      */
/* ------------------------------------------------------------------ */

function RegionPane({ region }: { region: RegionKey }) {
  switch (region) {
    case 'schedule':
      return <ScheduleRegion />;
    case 'feeds':
      return <FeedsRegion />;
    case 'vms':
      return <VmsRegion />;
  }
}

function ScheduleRegion() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['schedules', 'upcoming'],
    queryFn: () => api.get<Schedule[]>('/schedules?upcoming=true'),
    staleTime: 60_000,
  });
  const empty = !isLoading && !isError && (!data || data.length === 0);
  return (
    <RegionShell
      icon={<Calendar size={12} />}
      label="日程"
      loading={isLoading}
      offline={isError}
      offlineMsg={(error as Error | null)?.message}
      empty={empty}
    >
      <ul className="focus-region-list">
        {(data ?? []).slice(0, 4).map((s) => (
          <li key={s.id} className="focus-region-item">
            <span className="focus-region-title">{s.title}</span>
          </li>
        ))}
      </ul>
    </RegionShell>
  );
}

function FeedsRegion() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['feeds'],
    queryFn: () => api.get<Feed[]>('/feeds'),
    staleTime: 60_000,
  });
  const empty = !isLoading && !isError && (!data || data.length === 0);
  return (
    <RegionShell
      icon={<Rss size={12} />}
      label="信息源 RSS"
      loading={isLoading}
      offline={isError}
      offlineMsg={(error as Error | null)?.message}
      empty={empty}
    >
      <ul className="focus-region-list">
        {(data ?? []).slice(0, 4).map((f) => (
          <li key={f.id} className="focus-region-item">
            <span className="focus-region-title">{f.title ?? '(无标题)'}</span>
          </li>
        ))}
      </ul>
    </RegionShell>
  );
}

function VmsRegion() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['vms'],
    queryFn: () => api.get<VM[]>('/vms'),
    staleTime: 30_000,
  });
  const empty = !isLoading && !isError && (!data || data.length === 0);
  return (
    <RegionShell
      icon={<Server size={12} />}
      label="虚拟机"
      loading={isLoading}
      offline={isError}
      offlineMsg={(error as Error | null)?.message}
      empty={empty}
    >
      <ul className="focus-region-list">
        {(data ?? []).slice(0, 4).map((v) => (
          <li key={v.id} className="focus-region-item">
            <span className="focus-region-title">{v.name ?? v.id}</span>
            <span className="focus-region-meta">{v.status ?? '—'}</span>
          </li>
        ))}
      </ul>
    </RegionShell>
  );
}

function RegionShell({
  icon,
  label,
  loading,
  offline,
  offlineMsg,
  empty,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  loading: boolean;
  offline: boolean;
  offlineMsg?: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="focus-region">
      <div className="focus-section-header">
        {icon}
        <span>{label}</span>
      </div>
      <div className="focus-region-body">
        {loading ? (
          <div className="focus-region-loading">…</div>
        ) : offline ? (
          <div className="focus-offline">
            <span>server 未连接</span>
            <span className="focus-offline-hint">{offlineMsg ?? '连接后显示真实数据'}</span>
          </div>
        ) : empty ? (
          <div className="focus-offline">
            <span>暂无数据</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}