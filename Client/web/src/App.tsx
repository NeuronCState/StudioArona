import { lazy, Suspense, useEffect, useRef, type ReactNode } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { StudioAppShell } from "./components/studio/StudioAppShell";
import { StorageMigrationBanner } from "./components/studio/StorageMigrationBanner";
import { ConflictMergeDialog } from "./components/studio/ConflictMergeDialog";
import { useAuthStore } from "./stores/auth";
import { useSonettoConfigStore } from "./stores/sonetto-config";
import { useDesignModeStore } from "./stores/design-mode";
import { useTheme } from "./hooks/useTheme";
import { motion as m } from "./lib/motion";
import { useReducedMotion } from "./hooks/useReducedMotion";

// AronaShell is lazy-loaded so Three.js / PIXI / Spine are never in the
// initial Studio-mode bundle. They download only when user switches to Arona.
const AronaShell = lazy(() =>
  import("./components/arona/AronaShell").then((m) => ({
    default: m.AronaShell,
  })),
);
const LoginPage = lazy(() =>
  import("./pages/login/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const SetupPage = lazy(() =>
  import("./pages/setup/SetupPage").then((m) => ({ default: m.SetupPage })),
);
const StudioHomePage = lazy(() =>
  import("./pages/studio/StudioHomePage").then((m) => ({
    default: m.StudioHomePage,
  })),
);
const FeedsPage = lazy(() =>
  import("./pages/feeds/FeedsPage").then((m) => ({ default: m.FeedsPage })),
);
const SchedulePage = lazy(() =>
  import("./pages/schedule/SchedulePage").then((m) => ({
    default: m.SchedulePage,
  })),
);
const AdminPage = lazy(() =>
  import("./pages/admin/AdminPage").then((m) => ({ default: m.AdminPage })),
);
const SystemPage = lazy(() =>
  import("./pages/system/SystemPage").then((m) => ({ default: m.SystemPage })),
);
const VmsPage = lazy(() =>
  import("./pages/vms/VmsPage").then((m) => ({ default: m.VmsPage })),
);
const OCRPage = lazy(() =>
  import("./pages/ocr/OCRPage").then((m) => ({ default: m.OCRPage })),
);
const AgentConfigPage = lazy(() =>
  import("./pages/config/AgentConfigPage").then((m) => ({
    default: m.AgentConfigPage,
  })),
);
const PersonalSettingsPage = lazy(() =>
  import("./pages/settings/PersonalSettingsPage").then((m) => ({
    default: m.PersonalSettingsPage,
  })),
);

/** Per-route error boundary: one page crash doesn't take down the whole app. */
function RouteGuard({ children }: { children: ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

function ShellFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  const reducedMotion = useReducedMotion();
  const previousPath = useRef(location.pathname);
  const routeOrder = [
    "/",
    "/feeds",
    "/schedule",
    "/ocr",
    "/config",
    "/vms",
    "/system",
    "/admin",
    "/settings",
  ];
  const currentIndex = routeOrder.indexOf(location.pathname);
  const previousIndex = routeOrder.indexOf(previousPath.current);
  const direction = currentIndex >= previousIndex ? 1 : -1;

  useEffect(() => {
    previousPath.current = location.pathname;
    document.getElementById("main-content")?.scrollTo({ top: 0 });
  }, [location.pathname]);

  const variants = {
    enter: (value: number) =>
      reducedMotion
        ? { opacity: 1 }
        : { opacity: 0, x: value * 18, scale: 0.995 },
    center: { opacity: 1, x: 0, scale: 1 },
    exit: (value: number) =>
      reducedMotion
        ? { opacity: 1 }
        : { opacity: 0, x: value * -12, scale: 0.997 },
  };
  return (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={location.pathname}
        className="h-full w-full"
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{
          duration: reducedMotion ? 0 : m.duration.base / 1000,
          ease: m.easing.out,
        }}
      >
        <Routes location={location}>
          <Route path="/" element={<RouteGuard><StudioHomePage /></RouteGuard>} />
          <Route path="/admin" element={<RouteGuard><AdminPage /></RouteGuard>} />
          <Route path="/schedule" element={<RouteGuard><SchedulePage /></RouteGuard>} />
          <Route path="/feeds" element={<RouteGuard><FeedsPage /></RouteGuard>} />
          <Route path="/system" element={<RouteGuard><SystemPage /></RouteGuard>} />
          <Route path="/vms" element={<RouteGuard><VmsPage /></RouteGuard>} />
          <Route path="/ocr" element={<RouteGuard><OCRPage /></RouteGuard>} />
          <Route path="/config" element={<RouteGuard><AgentConfigPage /></RouteGuard>} />
          <Route path="/settings" element={<RouteGuard><PersonalSettingsPage /></RouteGuard>} />
          <Route path="/me/feeds" element={<RouteGuard><FeedsPage /></RouteGuard>} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  useTheme();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setupComplete = useSonettoConfigStore((s) => s.setupComplete);
  const mode = useDesignModeStore((s) => s.mode);

  // Dev bypass: ?devbypass=1 直接进 home (puppeteer 截图 + 离线浏览用)
  // ?setupbypass=1 跳过 SetupPage (SonettoHere 没配也能进)
  const devBypass =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("devbypass") === "1";
  const setupBypass =
    devBypass ||
    new URLSearchParams(window.location.search).get("setupbypass") === "1";

  // devbypass 模式强制设 authenticated (避免后续 401 自动 logout)
  useEffect(() => {
    if (devBypass && !isAuthenticated) {
      useAuthStore.getState().login(
        "dev-bypass-token",
        "dev-bypass-refresh",
        {
          id: "dev",
          username: "dev",
          display_name: "Dev User",
          role: "admin",
          created_at: new Date().toISOString(),
          preferences: {},
          face_enrolled: false,
        },
        { local: true },
      );
    }
    if (setupBypass && !useSonettoConfigStore.getState().setupComplete) {
      useSonettoConfigStore.getState().markSetupComplete();
    }
  }, [devBypass, setupBypass, isAuthenticated]);

  if (!isAuthenticated && !devBypass) {
    return (
      <Suspense fallback={<ShellFallback />}>
        <LoginPage />
      </Suspense>
    );
  }

  // 注册后首次进入，显示配置引导页
  if (!setupComplete && !setupBypass) {
    return (
      <Suspense fallback={<ShellFallback />}>
        <SetupPage />
      </Suspense>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {mode === "arona" ? (
        <motion.div
          key="arona"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
          style={{ position: "absolute", inset: 0 }}
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
          transition={{ duration: 0.35, ease: "easeInOut" }}
          style={{ position: "absolute", inset: 0 }}
        >
          <StudioAppShell>
            {/* AppRoutes 内层已包 AnimatePresence */}
            <Suspense fallback={<ShellFallback />}>
              <AppRoutes />
            </Suspense>
            {/* Tauri 桌面首次启动: IDB 旧数据 → 提示迁 fs (~/Documents/studioarona/) */}
            <StorageMigrationBanner />
            {/* 本地资源同步收到 409 时弹出手动合并。 */}
            <ConflictMergeDialog />
          </StudioAppShell>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
