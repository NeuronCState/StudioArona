import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Rss, Calendar, Monitor, Brain, Sparkles, ShieldCheck, PanelLeftClose, ChevronDown, Server, Scan, HardDrive, MessageSquarePlus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/session';
import { useAuthStore } from '@/stores/auth';
import { useConnectionStore } from '@/stores/connection';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@javis/ui-kit';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { DesignModeToggle } from '@/components/layout/DesignModeToggle';
import { LocaleToggle } from '@/components/layout/LocaleToggle';
import { ProfileSettingsDialog } from './ProfileSettingsDialog';
import { useT } from '@/lib/i18n';
import { StaggerList, StaggerItem } from '@/components/motion';
import { motion as m } from '@/lib/motion';
import { api } from '@/lib/api/client';
import { useFocusChatsStore } from '@/stores/focus-chats';
import { useFocusModeStore } from '@/stores/focus-mode';

const navItems = [
  { to: '/', icon: Home, i18nKey: 'sidebar.home' },
  { to: '/feeds', icon: Rss, i18nKey: 'sidebar.rss' },
  { to: '/schedule', icon: Calendar, i18nKey: 'sidebar.schedule' },
  { to: '/ocr', icon: Scan, i18nKey: 'sidebar.ocr' },
  { to: '/memory', icon: Brain, i18nKey: 'sidebar.memory' },
  { to: '/skills', icon: Sparkles, i18nKey: 'sidebar.skills' },
];

/** 工作室服务导航项 */
const studioNavItems = [
  { to: '/vms', icon: Monitor, i18nKey: 'sidebar.vms', label: '虚拟机', needConnection: true },
  { to: '/nas', icon: HardDrive, i18nKey: 'sidebar.nas', label: 'NAS 存储', needConnection: true },
  { to: '/admin', icon: ShieldCheck, i18nKey: 'sidebar.admin', label: '管理', needConnection: false, adminOnly: true },
];

/**
 * 路由 -> 预取的 query keys + fetchers
 * 用户 hover 导航项时, 后台预热这些 query cache
 * 点击导航时数据已在缓存, 切页无 EmptyState 闪
 */
const routePrefetchMap: Record<string, Array<{ key: readonly unknown[]; fetcher: () => Promise<unknown> }>> = {
  '/feeds': [
    { key: ['feeds'], fetcher: () => api.get('/feeds') },
    { key: ['page-monitors'], fetcher: () => api.get('/page-monitors') },
  ],
  '/schedule': [
    { key: ['schedules', 'upcoming'], fetcher: () => api.get('/schedules?upcoming=true') },
  ],
  '/memory': [
    { key: ['memory-entries'], fetcher: () => api.get('/memory/entries') },
  ],
  '/skills': [
    { key: ['skills'], fetcher: () => api.get('/v1/skills') },
  ],
  '/admin': [
    { key: ['admin-system'], fetcher: () => api.get('/admin/system') },
    { key: ['admin-users'], fetcher: () => api.get('/admin/users') },
  ],
  '/vms': [
    { key: ['vms'], fetcher: () => api.get('/vms') },
  ],
};

/**
 * 新对话按钮 — 在 StudioSidebar 顶部, Logo 跟 ThemeToggle 之间.
 *
 * 行为:
 *  - 在 store 里创建一条 chat (auto-naming "新对话 N")
 *  - 设为 active
 *  - 进入 focus mode (打开 AgentPanel, 让中心按钮扩散)
 *
 * FocusSidebar 拉出时, 这个按钮仍在 StudioSidebar 上 — 不重复.
 */
function NewChatButton() {
  const createChat = useFocusChatsStore((s) => s.createChat);
  const setFocusMode = useFocusModeStore((s) => s.setFocusMode);
  const t = useT();

  const handleClick = () => {
    createChat();
    setFocusMode(true);
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: m.duration.fast / 1000, ease: m.easing.out }}
      className="sidebar-new-chat"
      title={t('sidebar.newChat')}
    >
      <MessageSquarePlus size={14} />
      <span>{t('sidebar.newChat')}</span>
    </motion.button>
  );
}

export function StudioSidebar() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const wakeState = useSessionStore((s) => s.wakeState);
  const toggleSidebar = useSessionStore((s) => s.toggleSidebar);
  const location = useLocation();
  const queryClient = useQueryClient();
  const serverStatus = useConnectionStore((s) => s.serverStatus);
  const isLinuxConnected = serverStatus === 'online';
  const [linuxGroupOpen, setLinuxGroupOpen] = useState(isLinuxConnected);

  // hover/聚焦 nav 项时预取目标页面的 query — 切页无 EmptyState 闪
  const prefetchRoute = (to: string) => {
    const targets = routePrefetchMap[to];
    if (!targets) return;
    for (const t of targets) {
      queryClient.prefetchQuery({ queryKey: t.key, queryFn: t.fetcher });
    }
  };

  const visibleNavItems = navItems;
  const visibleStudioItems = studioNavItems.filter((item) => !item.adminOnly || user?.role === 'admin');

  const statusColor = {
    idle: 'bg-[var(--studio-text-muted)]',
    waking: 'bg-[var(--studio-accent)] animate-pulse',
    active: 'bg-[var(--studio-accent)]',
    leaving: 'bg-[var(--studio-warning)]',
  }[wakeState];

  return (
    <aside
      className="flex h-screen w-[208px] shrink-0 flex-col border-r"
      style={{
        backgroundColor: 'var(--studio-bg)',
        borderColor: 'var(--studio-border)',
      }}
    >
      {/* Top: Logo */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: m.duration.base / 1000, ease: m.easing.out }}
        className="flex items-center justify-between px-5 py-4"
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold"
            style={{
              backgroundColor: 'var(--studio-text-primary)',
              color: 'var(--studio-bg)',
            }}
          >
            S
          </div>
          <span
            className="text-base font-semibold tracking-tight"
            style={{ fontFamily: 'var(--studio-font-serif)', color: 'var(--studio-text-primary)' }}
          >
            {t('sidebar.studio')}
          </span>
        </div>
        <motion.button
          onClick={toggleSidebar}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: m.duration.fast / 1000, ease: m.easing.out }}
          className="rounded-md p-1.5"
          style={{ color: 'var(--studio-text-muted)' }}
          aria-label={t('sidebar.collapse')}
        >
          <PanelLeftClose size={16} />
        </motion.button>
      </motion.div>

      {/* 新对话 — 永远在 StudioSidebar 上, FocusSidebar 拉出时仍在 */}
      <NewChatButton />

      {/* Day/night theme toggle */}
      <ThemeToggle />

      {/* Language & mode toggle — same row */}
      <div className="flex items-center justify-center gap-0.5 px-3 py-1">
        <LocaleToggle />
        <DesignModeToggle />
      </div>

      {/* Spacer to push nav to bottom */}
      <div className="flex-1" />

      {/* Bottom: Nav items — stagger 进入 */}
      <nav>
      <StaggerList staggerKey="list" className="flex flex-col gap-1 px-3 pb-4" as="ul">
        {visibleNavItems.map(({ to, icon: Icon, i18nKey }) => {
          const isActive =
            to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <StaggerItem key={to} as="li">
              <NavLink
                to={to}
                end={to === '/'}
                title={t(i18nKey)}
                onMouseEnter={() => prefetchRoute(to)}
                onFocus={() => prefetchRoute(to)}
                className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium"
                style={
                  isActive
                    ? { backgroundColor: 'var(--studio-accent-soft)', color: 'var(--studio-accent)' }
                    : { color: 'var(--studio-text-secondary)' }
                }
              >
                <AnimatePresence>
                  {isActive && (
                    <motion.span
                      key="indicator"
                      className="absolute h-5 w-[3px] rounded-full"
                      // 垂直: framer-motion 接管 transform, 所以 center 化必须放在 animate 的 y 上
                      // top: '50%' 锚点在 NavLink 中心, 配合 y: '-50%' 让 indicator 上移半高
                      // 水平: 紧贴 NavLink 左内缘 (圆角最左端), 不凸出圆角
                      style={{
                        top: '50%',
                        left: '2px',
                        backgroundColor: 'var(--studio-accent)',
                      }}
                      initial={{ scaleY: 0, opacity: 0, y: '-50%' }}
                      animate={{ scaleY: 1, opacity: 1, y: '-50%' }}
                      exit={{ scaleY: 0, opacity: 0, y: '-50%' }}
                      transition={{ duration: m.duration.base / 1000, ease: m.easing.spring }}
                    />
                  )}
                </AnimatePresence>
                <motion.span
                  className="flex w-full items-center gap-3"
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: m.duration.fast / 1000, ease: m.easing.out }}
                >
                  <Icon size={18} />
                  <span>{t(i18nKey)}</span>
                </motion.span>
              </NavLink>
            </StaggerItem>
          );
        })}

        {/* 工作室服务分组 */}
        <StaggerItem as="li">
          <button
            onClick={() => setLinuxGroupOpen(!linuxGroupOpen)}
            className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--studio-accent-soft)]"
            style={{ color: 'var(--studio-text-secondary)' }}
          >
            <Server size={18} />
            <span className="flex-1 text-left">工作室服务</span>
            <motion.span
              animate={{ rotate: linuxGroupOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown size={14} />
            </motion.span>
            {!isLinuxConnected && (
              <span className="text-[10px] opacity-60">未连接</span>
            )}
          </button>
        </StaggerItem>

        {/* 工作室服务子菜单 */}
        <AnimatePresence>
          {linuxGroupOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {visibleStudioItems.map(({ to, icon: Icon, label, needConnection }) => {
                const isActive = location.pathname.startsWith(to);
                const disabled = needConnection && !isLinuxConnected;
                return (
                  <div
                    key={to}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-xl pl-10 pr-3 py-2 text-sm font-medium',
                      disabled && 'pointer-events-none opacity-40'
                    )}
                    style={
                      isActive && !disabled
                        ? { backgroundColor: 'var(--studio-accent-soft)', color: 'var(--studio-accent)' }
                        : { color: 'var(--studio-text-muted)' }
                    }
                  >
                    {!disabled ? (
                      <NavLink
                        to={to}
                        title={label}
                        onMouseEnter={() => prefetchRoute(to)}
                        onFocus={() => prefetchRoute(to)}
                        className="flex items-center gap-3"
                      >
                        <Icon size={16} />
                        <span>{label}</span>
                      </NavLink>
                    ) : (
                      <>
                        <Icon size={16} />
                        <span>{label}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </StaggerList>
      </nav>

      {/* Bottom: User area */}
      <div
        className="flex items-center gap-2 border-t px-4 py-3"
        style={{ borderColor: 'var(--studio-border)' }}
      >
        <div className="relative">
          <Avatar alt={user?.display_name ?? 'User'} size="sm" />
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2',
              statusColor,
            )}
            style={{ borderColor: 'var(--studio-bg)' }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-xs font-medium"
            style={{ color: 'var(--studio-text-primary)' }}
          >
            {user?.display_name ?? 'User'}
          </p>
          <p className="text-[10px]" style={{ color: 'var(--studio-text-muted)' }}>
            {wakeState === 'active' ? 'Online' : 'Idle'}
          </p>
        </div>
        <ProfileSettingsDialog />
      </div>
    </aside>
  );
}
