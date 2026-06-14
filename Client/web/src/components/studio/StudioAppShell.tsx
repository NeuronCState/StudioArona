import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { StudioSidebar } from './StudioSidebar';
import { useUIActionBridge } from '@/lib/ui-actions';
import { useThemeStore } from '@/hooks/useTheme';

interface StudioAppShellProps {
  children: ReactNode;
}

function resolveTheme(theme: string): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme === 'dark' ? 'dark' : 'light';
}

export function StudioAppShell({ children }: StudioAppShellProps) {
  useUIActionBridge();
  const location = useLocation();
  const theme = useThemeStore((s) => s.theme);
  const resolved = resolveTheme(theme);

  return (
    <div
      className="flex h-screen overflow-hidden"
      data-design-mode="studio"
      data-theme={resolved}
      style={{ backgroundColor: 'var(--studio-bg)' }}
    >
      <StudioSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <main id="main-content" className="flex-1 overflow-y-auto" key={location.pathname}>
          {children}
        </main>
      </div>
    </div>
  );
}
