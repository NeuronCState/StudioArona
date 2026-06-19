import {
  MessageCircle,
  Rss,
  Users,
  Server,
  Cpu,
  User,
  HardDrive,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/session";
import { useAuthStore } from "@/stores/auth";

const navItems = [
  { to: "/", icon: MessageCircle, label: "对话" },
  { to: "/me/feeds", icon: Rss, label: "信息源" },
  { to: "/shared", icon: Users, label: "共享" },
  { to: "/vms", icon: Server, label: "虚拟机" },
  { to: "/system", icon: Cpu, label: "硬件" },
  { to: "/nas", icon: HardDrive, label: "NAS" },
];

export function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const wakeState = useSessionStore((s) => s.wakeState);

  const statusColor = {
    idle: "bg-zinc-400",
    waking: "bg-accent animate-pulse",
    active: "bg-accent",
    leaving: "bg-blue-500",
  }[wakeState];

  return (
    <nav className="flex w-16 flex-col items-center border-r border-border bg-surface-raised py-4">
      <div className="mb-6 flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl">
        <img
          src="/208.jpg"
          alt="Arona"
          className="h-full w-full object-cover"
        />
      </div>

      <div className="flex flex-1 flex-col items-center gap-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                "hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                isActive && "bg-surface text-accent",
                !isActive && "text-text-secondary",
              )
            }
            title={label}
          >
            <Icon size={20} />
          </NavLink>
        ))}
      </div>

      <div className="flex flex-col items-center gap-3">
        <div
          className={cn("h-2 w-2 rounded-full", statusColor)}
          title={`状态: ${wakeState}`}
        />
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-text-secondary">
          {user?.display_name ? (
            <span className="text-xs font-medium">{user.display_name[0]}</span>
          ) : (
            <User size={16} />
          )}
        </div>
      </div>
    </nav>
  );
}
