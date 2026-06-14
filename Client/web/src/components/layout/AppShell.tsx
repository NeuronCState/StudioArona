import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { SkipToContent } from './SkipToContent';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { useUIActionBridge } from '@/lib/ui-actions';
import { useWakeEvents } from '@/hooks/useWakeEvents';
import { WakeOverlay } from '@/components/wake/WakeOverlay';
import { LeaveCountdown } from '@/components/wake/LeaveCountdown';
import { useSessionStore } from '@/stores/session';
import { useThemeStore } from '@/hooks/useTheme';

interface AppShellProps {
  children: ReactNode;
}

function resolveTheme(theme: string): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme === 'dark' ? 'dark' : 'light';
}

export function AppShell({ children }: AppShellProps) {
  useUIActionBridge();
  useWakeEvents();
  const sidebarCollapsed = useSessionStore((s) => s.sidebarCollapsed);
  const theme = useThemeStore((s) => s.theme);
  const resolved = resolveTheme(theme);

  return (
    <div
      className="flex h-screen overflow-hidden"
      data-theme={resolved}
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <SkipToContent />
      <Sidebar collapsed={sidebarCollapsed} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main id="main-content" className="flex-1 overflow-auto">{children}</main>
      </div>
      <ToastContainer />
      <WakeOverlay />
      <LeaveCountdown />
    </div>
  );
}
