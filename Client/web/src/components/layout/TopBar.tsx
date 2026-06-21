import { useLocation } from "react-router-dom";
import { useSessionStore } from "@/stores/session";
import { useTheme } from "@/hooks/useTheme";
import { Moon, Sun, Monitor, PanelLeft } from "lucide-react";
import { Avatar } from "@javis/ui-kit";
import { useAuthStore } from "@/stores/auth";
import { NotificationBell } from "./NotificationBell";
import { LocaleToggle } from "./LocaleToggle";

const pageTitles: Record<string, string> = {
  "/": "对话",
  "/feeds": "信息源",
  "/system": "系统监控",
  "/vms": "虚拟机",
};

export function TopBar() {
  const location = useLocation();
  const wakeState = useSessionStore((s) => s.wakeState);
  const sidebarCollapsed = useSessionStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useSessionStore((s) => s.toggleSidebar);
  const { theme, toggle } = useTheme();
  const user = useAuthStore((s) => s.user);
  const title = pageTitles[location.pathname] ?? "Arona OS";

  const statusDot = {
    idle: "bg-[var(--color-text-muted)]",
    waking: "bg-[var(--color-accent)] animate-pulse",
    active: "bg-[var(--color-accent)]",
    leaving: "bg-[var(--color-warn)]",
  }[wakeState];

  const statusLabel = {
    idle: "待机",
    waking: "唤醒中",
    active: "对话中",
    leaving: "离开",
  }[wakeState];

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <header className="flex h-12 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
      <div className="flex items-center gap-3">
        {sidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-secondary)] transition-colors"
            aria-label="展开侧边栏"
          >
            <PanelLeft size={16} />
          </button>
        )}
        <h1 className="font-serif text-sm font-semibold text-[var(--color-text-primary)]">
          {title}
        </h1>
        <div className="flex items-center gap-1.5">
          <div className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <NotificationBell />
        <LocaleToggle />
        <button
          onClick={toggle}
          className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)] transition-colors"
          title={`主题: ${theme === "dark" ? "暗黑" : theme === "light" ? "明亮" : "跟随系统"}`}
          aria-label="切换主题"
        >
          <ThemeIcon size={15} />
        </button>
        <div className="ml-1">
          <Avatar alt={user?.display_name ?? "User"} size="sm" />
        </div>
      </div>
    </header>
  );
}
