import { useState } from "react";
import { isOfflineError } from "@/lib/api/error-helpers";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useDelayedPending } from "@/hooks/useDelayedPending";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Activity,
  Users as UsersIcon,
  Wifi,
  WifiOff,
  Edit3,
  Save,
  X,
  ShieldCheck,
  TerminalSquare,
  Loader2,
  Mail,
  Send,
  Megaphone,
  MailCheck,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { Tabs, Badge, Skeleton, CardError, Button } from "@javis/ui-kit";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";
import { StaggerList, StaggerItem, FadeIn } from "@/components/motion";
import { motion } from "framer-motion";
import { motion as m } from "@/lib/motion";

// ─── System resources ────────────────────────────────────────────

interface SystemResources {
  cpu: { percent: number; count: number; load_avg: number[] | null };
  memory: { total: number; used: number; percent: number; available: number };
  disk: {
    total: number;
    used: number;
    free: number;
    percent: number;
    path: string;
  };
  network: {
    bytes_sent: number;
    bytes_recv: number;
    packets_sent: number;
    packets_recv: number;
  };
  top_processes: Array<{
    pid: number;
    name: string;
    username: string;
    rss: number;
  }>;
  boot_time: number;
}

function formatBytes(b: number): string {
  if (b >= 1e12) return `${(b / 1e12).toFixed(1)} TB`;
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`;
  return `${b} B`;
}

function ResourceBar({
  percent,
  label,
  used,
  total,
}: {
  percent: number;
  label: string;
  used: string;
  total: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--color-text-primary)]">
          {label}
        </span>
        <span className="text-[var(--color-text-muted)]">
          {used} / {total} ({percent.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg)]">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            percent > 80
              ? "bg-[var(--color-warn)]"
              : percent > 60
                ? "bg-[var(--color-accent)]"
                : "bg-[var(--color-accent-soft)]",
          )}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

function SystemTab() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["admin-system"],
    queryFn: () => api.get<SystemResources>("/admin/system"),
    refetchInterval: 5000,
  });
  const loading = useDelayedPending(isPending);

  if (loading && !data)
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rect" height={64} />
        ))}
      </div>
    );
  if (isError)
    return (
      <CardError
        offline={isOfflineError(error)}
        message={error?.message}
        onRetry={() => refetch()}
      />
    );
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-4 backdrop-blur-xl">
          <div className="mb-3 flex items-center gap-2">
            <Cpu size={14} className="text-[var(--color-accent)]" />
            <span className="text-sm font-semibold">CPU</span>
            <span className="ml-auto text-xs text-[var(--color-text-muted)]">
              {data.cpu.count} 核
              {data.cpu.load_avg &&
                ` · load ${data.cpu.load_avg[0].toFixed(2)}`}
            </span>
          </div>
          <ResourceBar
            label="使用率"
            percent={data.cpu.percent}
            used={`${data.cpu.percent.toFixed(1)}%`}
            total="100%"
          />
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-4 backdrop-blur-xl">
          <div className="mb-3 flex items-center gap-2">
            <MemoryStick size={14} className="text-[var(--color-accent)]" />
            <span className="text-sm font-semibold">内存</span>
            <span className="ml-auto text-xs text-[var(--color-text-muted)]">
              剩余 {formatBytes(data.memory.available)}
            </span>
          </div>
          <ResourceBar
            label="使用率"
            percent={data.memory.percent}
            used={formatBytes(data.memory.used)}
            total={formatBytes(data.memory.total)}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2">
          <HardDrive size={14} className="text-[var(--color-accent)]" />
          <span className="text-sm font-semibold">磁盘</span>
          <span className="ml-auto text-xs text-[var(--color-text-muted)]">
            {data.disk.path}
          </span>
        </div>
        <ResourceBar
          label="使用率"
          percent={data.disk.percent}
          used={formatBytes(data.disk.used)}
          total={formatBytes(data.disk.total)}
        />
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2">
          <Activity size={14} className="text-[var(--color-accent)]" />
          <span className="text-sm font-semibold">网络（累计）</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
          <div>
            <div className="text-[var(--color-text-muted)]">↑ 发送</div>
            <div className="font-mono text-sm">
              {formatBytes(data.network.bytes_sent)}
            </div>
          </div>
          <div>
            <div className="text-[var(--color-text-muted)]">↓ 接收</div>
            <div className="font-mono text-sm">
              {formatBytes(data.network.bytes_recv)}
            </div>
          </div>
          <div>
            <div className="text-[var(--color-text-muted)]">包发送</div>
            <div className="font-mono text-sm">
              {data.network.packets_sent.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[var(--color-text-muted)]">包接收</div>
            <div className="font-mono text-sm">
              {data.network.packets_recv.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2">
          <TerminalSquare size={14} className="text-[var(--color-accent)]" />
          <span className="text-sm font-semibold">Top 10 进程（按内存）</span>
        </div>
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-bg)] text-[var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">PID</th>
                <th className="px-3 py-1.5 text-left font-medium">名称</th>
                <th className="px-3 py-1.5 text-left font-medium">用户</th>
                <th className="px-3 py-1.5 text-right font-medium">RSS</th>
              </tr>
            </thead>
            <motion.tbody
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 1 },
                show: {
                  opacity: 1,
                  transition: {
                    staggerChildren: m.stagger.list,
                    delayChildren: 0.1,
                  },
                },
              }}
            >
              {data.top_processes.map((p) => (
                <motion.tr
                  key={p.pid}
                  className="border-t border-[var(--color-border)] transition-colors duration-fast hover:bg-[var(--color-bg)]"
                  variants={{
                    hidden: { opacity: 0, x: -8 },
                    show: {
                      opacity: 1,
                      x: 0,
                      transition: {
                        duration: m.duration.base / 1000,
                        ease: m.easing.out,
                      },
                    },
                  }}
                >
                  <td className="px-3 py-1.5 font-mono">{p.pid}</td>
                  <td className="px-3 py-1.5">{p.name}</td>
                  <td className="px-3 py-1.5 text-[var(--color-text-muted)]">
                    {p.username}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {formatBytes(p.rss)}
                  </td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Users tab ────────────────────────────────────────────────

interface AdminUser {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  role: "admin" | "member";
  created_at: string;
  last_login_at: string | null;
  online: boolean;
  hermes_pid: number | null;
  hermes_last_active: number | null;
  hermes_rss_bytes: number;
}

interface NotifyResult {
  ok: boolean;
  to?: string;
  error?: string;
}

function UsersTab() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    display_name: string;
    role: "admin" | "member";
  }>({ display_name: "", role: "member" });

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<AdminUser[]>("/admin/users"),
    refetchInterval: 10000,
  });
  const loading = useDelayedPending(isPending);

  // Administrative writes are intentionally server-only; local optimistic state
  // must not imply that a privileged operation succeeded.
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { display_name?: string; role?: "admin" | "member" };
    }) => api.patch(`/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const killSessionMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/kill-session`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const notifyUserMutation = useMutation({
    mutationFn: ({
      id,
      subject,
      body,
    }: {
      id: string;
      subject: string;
      body: string;
    }) => api.post<NotifyResult>(`/admin/notify/user/${id}`, { subject, body }),
  });

  const startEdit = (u: AdminUser) => {
    setEditing(u.id);
    setEditForm({ display_name: u.display_name, role: u.role });
  };

  const saveEdit = (id: string) => {
    updateMutation.mutate({ id, body: editForm });
    setEditing(null);
  };

  if (loading && !data)
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rect" height={56} />
        ))}
      </div>
    );
  if (isError)
    return (
      <CardError
        offline={isOfflineError(error)}
        message={error?.message}
        onRetry={() => refetch()}
      />
    );
  if (!data) return null;

  const onlineCount = data.filter((u) => u.online).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-xs">
        <UsersIcon size={14} className="text-[var(--color-text-muted)]" />
        <span>总用户 {data.length}</span>
        <span className="text-[var(--color-text-muted)]">·</span>
        <Wifi size={12} className="text-emerald-500" />
        <span>在线 {onlineCount}</span>
        <span className="text-[var(--color-text-muted)]">·</span>
        <WifiOff size={12} className="text-[var(--color-text-muted)]" />
        <span>离线 {data.length - onlineCount}</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-glass)] backdrop-blur-xl">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-bg)] text-xs text-[var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2 text-left font-medium">用户</th>
              <th className="px-4 py-2 text-left font-medium">角色</th>
              <th className="px-4 py-2 text-left font-medium">在线</th>
              <th className="px-4 py-2 text-left font-medium">Agent</th>
              <th className="px-4 py-2 text-left font-medium">最后登录</th>
              <th className="px-4 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <motion.tbody
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 1 },
              show: {
                opacity: 1,
                transition: {
                  staggerChildren: m.stagger.list,
                  delayChildren: 0.05,
                },
              },
            }}
          >
            {data.map((u) => (
              <motion.tr
                key={u.id}
                className="border-t border-[var(--color-border)] transition-colors duration-fast hover:bg-[var(--color-bg)]"
                variants={{
                  hidden: { opacity: 0, y: 6 },
                  show: {
                    opacity: 1,
                    y: 0,
                    transition: {
                      duration: m.duration.base / 1000,
                      ease: m.easing.out,
                    },
                  },
                }}
              >
                <td className="px-4 py-2.5">
                  {editing === u.id ? (
                    <input
                      value={editForm.display_name}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          display_name: e.target.value,
                        })
                      }
                      className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
                    />
                  ) : (
                    <div>
                      <div className="font-medium text-[var(--color-text-primary)]">
                        {u.display_name}
                      </div>
                      <div className="text-[10px] text-[var(--color-text-muted)]">
                        @{u.username}
                      </div>
                      {u.email && (
                        <div className="text-[10px] text-[var(--color-accent)]">
                          📧 {u.email}
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {editing === u.id ? (
                    <select
                      value={editForm.role}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          role: e.target.value as "admin" | "member",
                        })
                      }
                      className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                  ) : (
                    <Badge variant={u.role === "admin" ? "accent" : "default"}>
                      {u.role === "admin" && (
                        <ShieldCheck size={10} className="mr-0.5" />
                      )}
                      {u.role}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {u.online ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      在线
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                      <span className="h-2 w-2 rounded-full bg-[var(--color-text-muted)]" />
                      离线
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {u.hermes_pid ? (
                    <div>
                      <code className="text-[10px]">pid {u.hermes_pid}</code>
                      {u.hermes_rss_bytes > 0 && (
                        <div className="text-[10px] text-[var(--color-text-muted)]">
                          {formatBytes(u.hermes_rss_bytes)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-[var(--color-text-muted)]">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-text-muted)]">
                  {u.last_login_at
                    ? new Date(u.last_login_at).toLocaleString("zh-CN")
                    : "从未"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {me?.id === u.id ? (
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      你自己
                    </span>
                  ) : editing === u.id ? (
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => saveEdit(u.id)}
                        className="rounded p-1 text-emerald-500 hover:bg-[var(--color-bg)]"
                        title="保存"
                      >
                        <Save size={14} />
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
                        title="取消"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => startEdit(u)}
                        className="rounded p-1 hover:bg-[var(--color-bg)]"
                        title="编辑"
                      >
                        <Edit3 size={14} />
                      </button>
                      {u.email && (
                        <button
                          onClick={() => {
                            const subject = window.prompt(
                              "邮件主题",
                              `📢 来自 ${useAuthStore.getState().user?.display_name || "admin"}`,
                            );
                            if (!subject) return;
                            const body = window.prompt(
                              "邮件内容",
                              "这是一封来自什亭之匣 AI 管理面板的通知。",
                            );
                            if (!body) return;
                            notifyUserMutation.mutate(
                              { id: u.id, subject, body },
                              {
                                onSuccess: (res) => {
                                  if (res?.ok) {
                                    window.alert(`✅ 已发送给 ${u.email}`);
                                  } else {
                                    window.alert(
                                      `❌ 发送失败: ${res?.error || "未知错误"}`,
                                    );
                                  }
                                },
                                onError: (error) =>
                                  window.alert(
                                    `❌ 发送失败: ${error instanceof Error ? error.message : String(error)}`,
                                  ),
                              },
                            );
                          }}
                          className="rounded p-1 text-[var(--color-accent)] hover:bg-[var(--color-bg)]"
                          title={`发送通知到 ${u.email}`}
                          disabled={notifyUserMutation.isPending}
                        >
                          {notifyUserMutation.isPending ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Mail size={14} />
                          )}
                        </button>
                      )}
                      {u.online && (
                        <button
                          onClick={() => killSessionMutation.mutate(u.id)}
                          className="rounded p-1 text-[var(--color-warn)] hover:bg-[var(--color-bg)]"
                          title="强制下线"
                          disabled={killSessionMutation.isPending}
                        >
                          {killSessionMutation.isPending ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <X size={14} />
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Notifications tab ──────────────────────────────────────

interface NotifyStatus {
  backend?: "smtp" | "graph";
  host?: string;
  port?: number;
  user?: string;
  pass_set?: boolean;
  ssl?: boolean;
  from_name?: string;
  from_email?: string;
  mode?: string;
  client_id_set?: boolean;
  client_secret_set?: boolean;
  token_cached?: boolean;
}

interface DeadLetterItem {
  ts: string;
  to: string;
  subject: string;
  reason?: string;
}

interface TestNotifyResult {
  ok: boolean;
  to?: string;
}

interface BroadcastResult {
  ok: number;
  failed: number;
  skipped: number;
}

function NotificationsTab() {
  const qc = useQueryClient();
  const [testTo, setTestTo] = useState("345988168@qq.com");
  const [testSubject, setTestSubject] = useState("🧪 什亭之匣 AI · 测试邮件");
  const [testBody, setTestBody] = useState(
    "这是一封来自什亭之匣 AI 的测试邮件 — SMTP 通道正常 ✅",
  );
  const [bcSubject, setBcSubject] = useState("📢 什亭之匣 AI · 群发通知");
  const [bcBody, setBcBody] = useState(
    "这是一封群发测试邮件。如果你看到这封邮件，说明 broadcast 端点全通。",
  );

  const { data: status } = useQuery({
    queryKey: ["admin-notify-status"],
    queryFn: () => api.get<NotifyStatus>("/admin/notify/status"),
  });

  const { data: dlq } = useQuery({
    queryKey: ["admin-notify-dlq"],
    queryFn: () =>
      api.get<{ count: number; items: DeadLetterItem[] }>("/admin/notify/dlq"),
    refetchInterval: 15000,
  });

  // Notification and dead-letter operations are authoritative server resources.
  const testMutation = useMutation({
    mutationFn: () =>
      api.post<TestNotifyResult>("/admin/notify/test", {
        to: testTo,
        subject: testSubject,
        body: testBody,
      }),
    onSuccess: (res) => {
      if (res?.ok) qc.invalidateQueries({ queryKey: ["admin-notify-dlq"] });
    },
  });

  const broadcastMutation = useMutation({
    mutationFn: () =>
      api.post<BroadcastResult>("/admin/notify/broadcast", {
        subject: bcSubject,
        body: bcBody,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notify-dlq"] }),
  });

  return (
    <div className="space-y-4">
      {/* Status card */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2">
          <MailCheck size={14} className="text-[var(--color-accent)]" />
          <span className="text-sm font-semibold">通知通道状态</span>
        </div>
        {status ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs md:grid-cols-3">
            <div>
              <span className="text-[var(--color-text-muted)]">后端：</span>
              <Badge variant="accent">{status.backend}</Badge>
            </div>
            {status.host && (
              <div>
                <span className="text-[var(--color-text-muted)]">SMTP：</span>
                <code>
                  {status.host}:{status.port}
                </code>
              </div>
            )}
            {status.user && (
              <div>
                <span className="text-[var(--color-text-muted)]">发件：</span>
                <code>{status.user}</code>
              </div>
            )}
            {status.pass_set !== undefined && (
              <div>
                <span className="text-[var(--color-text-muted)]">密码：</span>
                {status.pass_set ? (
                  <span className="text-emerald-500">已设 ✓</span>
                ) : (
                  <span className="text-[var(--color-warn)]">未设</span>
                )}
              </div>
            )}
            {status.ssl !== undefined && (
              <div>
                <span className="text-[var(--color-text-muted)]">SSL：</span>
                {String(status.ssl)}
              </div>
            )}
            {status.from_name && (
              <div>
                <span className="text-[var(--color-text-muted)]">发件人：</span>
                {status.from_name}
              </div>
            )}
            {status.mode && (
              <div>
                <span className="text-[var(--color-text-muted)]">模式：</span>
                <Badge>{status.mode}</Badge>
              </div>
            )}
            {status.client_id_set !== undefined && (
              <div>
                <span className="text-[var(--color-text-muted)]">
                  client_id：
                </span>
                {status.client_id_set ? (
                  <span className="text-emerald-500">已设 ✓</span>
                ) : (
                  <span className="text-[var(--color-warn)]">未设</span>
                )}
              </div>
            )}
            {status.token_cached !== undefined && (
              <div>
                <span className="text-[var(--color-text-muted)]">token：</span>
                {status.token_cached ? (
                  <span className="text-emerald-500">已缓存 ✓</span>
                ) : (
                  <span className="text-[var(--color-warn)]">需登录</span>
                )}
              </div>
            )}
          </div>
        ) : (
          <Skeleton variant="rect" height={64} />
        )}
      </div>

      {/* Test send */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2">
          <Send size={14} className="text-[var(--color-accent)]" />
          <span className="text-sm font-semibold">📧 测试发送</span>
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="目标邮箱"
              className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm"
            />
          </div>
          <input
            value={testSubject}
            onChange={(e) => setTestSubject(e.target.value)}
            placeholder="主题"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm"
          />
          <textarea
            value={testBody}
            onChange={(e) => setTestBody(e.target.value)}
            placeholder="正文"
            rows={3}
            className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !testTo}
            >
              {testMutation.isPending ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <Send size={14} className="mr-1" />
              )}
              发送测试
            </Button>
            {testMutation.isSuccess && testMutation.data?.ok !== undefined && (
              <span
                className={
                  "text-xs " +
                  (testMutation.data.ok
                    ? "text-emerald-500"
                    : "text-[var(--color-warn)]")
                }
              >
                {testMutation.data.ok
                  ? `✅ 已发送给 ${testMutation.data.to}`
                  : `❌ 失败`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Broadcast */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2">
          <Megaphone size={14} className="text-[var(--color-accent)]" />
          <span className="text-sm font-semibold">📢 群发通知</span>
          <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">
            发送给所有设置了 email 的用户
          </span>
        </div>
        <div className="space-y-2">
          <input
            value={bcSubject}
            onChange={(e) => setBcSubject(e.target.value)}
            placeholder="主题"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm"
          />
          <textarea
            value={bcBody}
            onChange={(e) => setBcBody(e.target.value)}
            placeholder="正文"
            rows={3}
            className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (window.confirm(`确定群发「${bcSubject}」给所有用户？`)) {
                  broadcastMutation.mutate();
                }
              }}
              disabled={broadcastMutation.isPending}
            >
              {broadcastMutation.isPending ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <Megaphone size={14} className="mr-1" />
              )}
              群发
            </Button>
            {broadcastMutation.isSuccess && broadcastMutation.data && (
              <span className="text-xs">
                ✅ {broadcastMutation.data.ok} 成功 · ❌{" "}
                {broadcastMutation.data.failed} 失败 · 跳过{" "}
                {broadcastMutation.data.skipped}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* DLQ */}
      {dlq && dlq.count > 0 && (
        <div className="rounded-2xl border border-[var(--color-warn)]/30 bg-[var(--color-warn)]/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs">
            <X size={12} className="text-[var(--color-warn)]" />
            <span className="font-semibold text-[var(--color-warn)]">
              死信队列（{dlq.count} 条）
            </span>
          </div>
          <StaggerList className="space-y-1">
            {dlq.items
              .slice(-5)
              .reverse()
              .map((it, i) => (
                <StaggerItem key={i}>
                  <div className="rounded bg-[var(--color-bg)] px-2 py-1 text-[10px] font-mono text-[var(--color-text-muted)]">
                    <span className="text-[var(--color-warn)]">[{it.ts}]</span>{" "}
                    {it.to} · {it.subject} · {it.reason?.slice(0, 80)}
                  </div>
                </StaggerItem>
              ))}
          </StaggerList>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────

export function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [tab, setTab] = useState<"system" | "users" | "notifications">(
    "system",
  );

  // Route guard: must be admin
  if (user && user.role !== "admin") {
    return (
      <div className="studio-page mx-auto max-w-md p-12">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-8 text-center backdrop-blur-xl">
          <ShieldCheck
            size={32}
            className="mx-auto mb-3 text-[var(--color-warn)]"
          />
          <h2 className="text-lg font-semibold">需要管理员权限</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            当前账号（{user.display_name}）是 {user.role}，不是管理员。
          </p>
          <Button size="sm" className="mt-4" onClick={() => navigate("/")}>
            返回首页
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="studio-page mx-auto max-w-5xl space-y-6 p-6">
      <FadeIn>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">
              Admin
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--color-text-primary)]">
              管理面板
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              系统资源监控、用户管理、邮件通知（仅管理员可见）。
            </p>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.6, rotate: -20 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{
              duration: m.duration.scenic / 1000,
              ease: m.easing.spring,
              delay: 0.1,
            }}
          >
            <ShieldCheck size={28} className="text-[var(--color-accent)]" />
          </motion.div>
        </div>
      </FadeIn>

      <Tabs
        tabs={[
          { id: "system", label: "系统资源" },
          { id: "users", label: "用户列表" },
          { id: "notifications", label: "邮件通知" },
        ]}
        activeTab={tab}
        onTabChange={(t) => setTab(t as typeof tab)}
      />

      {tab === "system" ? (
        <SystemTab />
      ) : tab === "users" ? (
        <UsersTab />
      ) : (
        <NotificationsTab />
      )}
    </div>
  );
}
