import { Home, Rss, Cpu, Server, Calendar, PanelLeftClose } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/session";
import { useDesignModeStore } from "@/stores/design-mode";
import { useAuthStore } from "@/stores/auth";
import { Avatar } from "@javis/ui-kit";
import { ThemeToggle } from "./ThemeToggle";
import { DesignModeToggle } from "./DesignModeToggle";

const primaryNav = [{ to: "/", icon: Home, label: "首页" }];

const secondaryNav = [
  { to: "/schedule", icon: Calendar, label: "日程" },
  { to: "/feeds", icon: Rss, label: "信息源" },
  { to: "/system", icon: Cpu, label: "系统" },
  { to: "/vms", icon: Server, label: "虚拟机" },
];

interface SidebarProps {
  collapsed?: boolean;
}

export function Sidebar({ collapsed = false }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const wakeState = useSessionStore((s) => s.wakeState);
  const toggleSidebar = useSessionStore((s) => s.toggleSidebar);
  const designMode = useDesignModeStore((s) => s.mode);
  const isStudio = designMode === "studio";

  const statusColor = {
    idle: "bg-[var(--color-text-muted)]",
    waking: "bg-[var(--color-accent)] animate-pulse",
    active: "bg-[var(--color-accent)]",
    leaving: "bg-[var(--color-warn)]",
  }[wakeState];

  const statusLabel = {
    idle: "待机",
    waking: "唤醒中",
    active: "活跃",
    leaving: "离开",
  }[wakeState];

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-glass)] backdrop-blur-xl",
        "sidebar-transition-width",
        collapsed ? "w-0 overflow-hidden border-r-0" : "w-[240px]",
      )}
    >
      {/* Logo area */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          {isStudio ? (
            <>
              <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--color-text-primary)] text-sm font-bold text-[var(--color-bg)]">
                S
              </div>
              <div>
                <span
                  className="block text-sm font-semibold text-[var(--color-text-primary)]"
                  style={{ fontFamily: "var(--font-serif, serif)" }}
                >
                  Studio301
                </span>
                <span className="block text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                  Workbench
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-9 w-9 items-center justify-center rounded-[16px] bg-[linear-gradient(135deg,var(--color-arona-cyan),var(--color-arona-blue))] text-sm font-bold text-white shadow-[var(--shadow-arona-1)]">
                A
              </div>
              <div>
                <span className="block text-sm font-bold text-[var(--color-text-primary)]">
                  Arona 阿洛娜
                </span>
                <span className="block text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                  Command Center
                </span>
              </div>
            </>
          )}
        </div>
        <button
          onClick={toggleSidebar}
          className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-secondary)] transition-colors"
          aria-label="折叠侧边栏"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      {/* Day/night theme toggle */}
      <ThemeToggle />

      {/* Arona / Studio mode toggle */}
      <DesignModeToggle />

      {/* Primary nav */}
      <nav className="px-2 py-1">
        <div className="space-y-0.5">
          {primaryNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-[12px] px-3 py-2 text-sm transition-all duration-200",
                  isStudio
                    ? cn(
                        "hover:bg-[var(--color-surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
                        isActive &&
                          "bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-semibold",
                        !isActive && "text-[var(--color-text-secondary)]",
                      )
                    : cn(
                        "hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-arona-blue)]",
                        isActive &&
                          "bg-white/80 text-[var(--color-arona-deep)] font-semibold shadow-[var(--shadow-1)]",
                        !isActive && "text-[var(--color-text-secondary)]",
                      ),
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </div>

        <div className="my-3 border-t border-[var(--color-border-subtle)]" />

        <div className="space-y-0.5">
          {secondaryNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-[12px] px-3 py-2 text-sm transition-all duration-200",
                  isStudio
                    ? cn(
                        "hover:bg-[var(--color-surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
                        isActive &&
                          "bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-semibold",
                        !isActive && "text-[var(--color-text-secondary)]",
                      )
                    : cn(
                        "hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-arona-blue)]",
                        isActive &&
                          "bg-white/80 text-[var(--color-arona-deep)] font-semibold shadow-[var(--shadow-1)]",
                        !isActive && "text-[var(--color-text-secondary)]",
                      ),
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Bottom user area */}
      <div className="border-t border-[var(--color-border)] px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Avatar alt={user?.display_name ?? "User"} size="sm" />
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-surface)]",
                statusColor,
              )}
              title={statusLabel}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-xs font-medium text-[var(--color-text-primary)]">
              {user?.display_name ?? "用户"}
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)]">
              {statusLabel}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
