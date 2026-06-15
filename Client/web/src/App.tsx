import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { StudioAppShell } from './components/studio/StudioAppShell';
import { FeedsPage } from './pages/feeds/FeedsPage';
import { LoginPage } from './pages/login/LoginPage';
import { MemoryPage } from './pages/memory/MemoryPage';
import { SkillsPage } from './pages/skills/SkillsPage';
import { SchedulePage } from './pages/schedule/SchedulePage';
import { AdminPage } from './pages/admin/AdminPage';
import { StudioHomePage } from './pages/studio/StudioHomePage';
import { SystemPage } from './pages/system/SystemPage';
import { VmsPage } from './pages/vms/VmsPage';
import { OCRPage } from './pages/ocr/OCRPage';
import { useAuthStore } from './stores/auth';
import { useDesignModeStore } from './stores/design-mode';
import { useTheme } from './hooks/useTheme';
import { motion as m } from './lib/motion';

// AronaShell is lazy-loaded so Three.js / PIXI / Spine are never in the
// initial Studio-mode bundle. They download only when user switches to Arona.
const AronaShell = lazy(() =>
  import('./components/arona/AronaShell').then((m) => ({ default: m.AronaShell })),
);

function ShellFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        className="h-full w-full"
        initial={{ y: 6, opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -4, opacity: 0.6 }}
        transition={{ duration: m.duration.fast / 1000, ease: m.easing.out }}
      >
        <Routes location={location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/feeds" element={<FeedsPage />} />
          <Route path="/system" element={<SystemPage />} />
          <Route path="/vms" element={<VmsPage />} />
          <Route path="/ocr" element={<OCRPage />} />
          <Route path="/me/feeds" element={<FeedsPage />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

function HomePage() {
  return <StudioHomePage />;
}

export default function App() {
  useTheme();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const mode = useDesignModeStore((s) => s.mode);

  // Dev bypass: ?devbypass=1 直接进 home (puppeteer 截图用)
  const devBypass =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('devbypass') === '1';

  // devbypass 模式强制设 authenticated (避免后续 401 自动 logout)
  useEffect(() => {
    if (devBypass && !isAuthenticated) {
      useAuthStore.getState().login(
        'dev-bypass-token',
        'dev-bypass-refresh',
        { id: 'admin', username: 'admin', display_name: 'Admin', role: 'admin', created_at: new Date().toISOString() } as any,
      );
    }
  }, [devBypass, isAuthenticated]);

  if (!isAuthenticated && !devBypass) {
    return <LoginPage />;
  }

  return (
    <AnimatePresence mode="wait">
      {mode === 'arona' ? (
        <motion.div
          key="arona"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <Suspense fallback={<ShellFallback />}>
            <AronaShell />
          </Suspense>
        </motion.div>
      ) : (
        <motion.div
          key="studio"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <StudioAppShell>
            {/* AppRoutes 内层已包 AnimatePresence */}
            <AppRoutes />
          </StudioAppShell>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
