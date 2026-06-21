import { useActionState, useEffect, useState } from "react";
import {
  Bell,
  Check,
  LogOut,
  MonitorCog,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Avatar, Button } from "@javis/ui-kit";
import { api } from "@/lib/api/client";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeStore } from "@/hooks/useTheme";
import { useLocaleStore } from "@/stores/locale";
import { useDesignModeStore } from "@/stores/design-mode";
import { useAuthStore } from "@/stores/auth";
import { motion as motionTokens } from "@/lib/motion";

type Section = "profile" | "notifications" | "appearance" | "account";

const sections = [
  { id: "profile", label: "个人资料", icon: UserRound },
  { id: "notifications", label: "通知", icon: Bell },
  { id: "appearance", label: "外观", icon: MonitorCog },
  { id: "account", label: "账户", icon: ShieldCheck },
] as const;

const fieldClass =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]";

export function PersonalSettingsPage() {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  const designMode = useDesignModeStore((state) => state.mode);
  const setDesignMode = useDesignModeStore((state) => state.setMode);
  const [section, setSection] = useState<Section>("profile");
  // Profile fields → migrated to useActionState ProfileForm component
  // Notifications fields → still local state
  const [email, setEmail] = useState(user?.email ?? "");
  const [notifyByEmail, setNotifyByEmail] = useState(user?.notify_by_email ?? false);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifMessage, setNotifMessage] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    setEmail(user?.email ?? "");
    setNotifyByEmail(user?.notify_by_email ?? false);
  }, [user]);

  const saveNotifications = async () => {
    if (!user) return;
    setNotifSaving(true);
    setNotifMessage(null);
    try {
      const response = await api.patch<{
        email: string | null;
        notify_by_email: boolean;
      }>("/me/notification-prefs", {
        email: email.trim() || null,
        notify_by_email: notifyByEmail,
      });
      setUser({
        ...user,
        email: response.email,
        notify_by_email: response.notify_by_email,
      });
      setNotifMessage({ error: false, text: "通知设置已保存" });
    } catch (error) {
      setNotifMessage({ error: true, text: (error as Error).message });
    } finally {
      setNotifSaving(false);
    }
  };

  const transition = reducedMotion
    ? { duration: 0 }
    : {
        duration: motionTokens.duration.base / 1000,
        ease: motionTokens.easing.out,
      };

  return (
    <div className="studio-page @container mx-auto min-h-full max-w-6xl px-5 py-6 md:px-8 md:py-8">
      <header className="mb-8 flex items-center gap-4 border-b border-[var(--color-border)] pb-6">
        <Avatar
          src={(user?.preferences as Record<string, string> | undefined)?.avatar_url ?? ""}
          alt={user?.display_name || user?.username || "User"}
          size="xl"
        />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-[var(--color-text-muted)]">
            Personal
          </p>
          <h1 className="mt-1 truncate text-2xl font-bold text-[var(--color-text-primary)]">
            {user?.display_name || user?.username || "个人设置"}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            @{user?.username || "user"}
          </p>
        </div>
      </header>

      <div className="grid gap-8 md:grid-cols-[190px_minmax(0,1fr)]">
        <nav
          aria-label="个人设置分区"
          className="flex gap-1 overflow-x-auto md:flex-col"
        >
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setSection(id);
                setNotifMessage(null);
              }}
              className={`relative flex shrink-0 items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors md:w-full ${
                section === id
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]"
              }`}
            >
              {section === id && (
                <motion.span
                  layoutId="personal-settings-active"
                  className="absolute bottom-1 left-1 top-1 w-0.5 rounded-full bg-[var(--color-accent)]"
                  transition={transition}
                />
              )}
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={section}
              initial={reducedMotion ? false : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? { opacity: 1 } : { opacity: 0, x: -8 }}
              transition={transition}
            >
              {section === "profile" && (
                <ProfileForm user={user} setUser={setUser} />
              )}

              {section === "notifications" && (
                <SettingsSection
                  title="通知"
                  description="管理离线邮件与通知接收方式。"
                >
                  <SettingField label="通知邮箱">
                    <input
                      type="email"
                      className={fieldClass}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </SettingField>
                  <label className="mt-5 flex cursor-pointer items-start justify-between gap-4 border-y border-[var(--color-border)] py-4">
                    <span>
                      <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                        离线邮件
                      </span>
                      <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
                        Client 离线时接收信息源变更通知。
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={notifyByEmail}
                      onChange={(event) =>
                        setNotifyByEmail(event.target.checked)
                      }
                      className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
                    />
                  </label>
                  <ActionRow message={notifMessage}>
                    <Button
                      disabled={notifSaving}
                      onClick={() => void saveNotifications()}
                    >
                      <Save size={14} /> {notifSaving ? "保存中…" : "保存通知"}
                    </Button>
                  </ActionRow>
                </SettingsSection>
              )}

              {section === "appearance" && (
                <SettingsSection
                  title="外观"
                  description="这些选项仅保存在当前设备。"
                >
                  <ChoiceRow
                    label="主题"
                    value={theme}
                    options={[
                      ["system", "跟随系统"],
                      ["light", "浅色"],
                      ["dark", "深色"],
                    ]}
                    onChange={(value) => setTheme(value as typeof theme)}
                  />
                  <ChoiceRow
                    label="语言"
                    value={locale}
                    options={[
                      ["zh", "中文"],
                      ["en", "English"],
                    ]}
                    onChange={(value) => setLocale(value as typeof locale)}
                  />
                  <ChoiceRow
                    label="界面模式"
                    value={designMode}
                    options={[
                      ["studio", "Studio"],
                      ["arona", "Arona"],
                    ]}
                    onChange={(value) =>
                      setDesignMode(value as typeof designMode)
                    }
                  />
                </SettingsSection>
              )}

              {section === "account" && (
                <SettingsSection
                  title="账户"
                  description="当前登录身份与本机会话。"
                >
                  <dl className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
                    <InfoRow label="用户 ID" value={user?.id ?? "—"} />
                    <InfoRow label="角色" value={user?.role ?? "—"} />
                    <InfoRow
                      label="人脸资料"
                      value={user?.face_enrolled ? "已录入" : "未录入"}
                    />
                  </dl>
                  <div className="mt-8 flex items-center justify-between border-t border-red-200 pt-5 dark:border-red-900/50">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        退出当前会话
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        本机上的未同步数据不会被删除。
                      </p>
                    </div>
                    <Button
                      variant="danger"
                      onClick={() => {
                        logout();
                        navigate("/");
                      }}
                    >
                      <LogOut size={14} /> 退出登录
                    </Button>
                  </div>
                </SettingsSection>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          {title}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

// ── ProfileForm (React 19 useActionState) ──

interface ProfileFormState { message: string; error: boolean }

function ProfileForm({ user, setUser }: {
  user: ReturnType<typeof useAuthStore.getState>["user"];
  setUser: ReturnType<typeof useAuthStore.getState>["setUser"];
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ProfileFormState, formData: FormData) => {
      if (!user) return { message: "", error: false };
      const username = (formData.get("username") as string).trim() || user.username;
      const displayName = (formData.get("displayName") as string).trim() || user.display_name;
      const avatarUrl = (formData.get("avatarUrl") as string).trim() || null;

      const preferences = { ...(user.preferences as Record<string, unknown>), avatar_url: avatarUrl };
      setUser({ ...user, username, display_name: displayName, preferences });

      try {
        await Promise.all([
          api.patch("/me", { username, display_name: displayName }),
          api.patch("/me/preferences", { key: "avatar_url", value: avatarUrl }),
        ]);
        return { message: "个人资料已保存", error: false };
      } catch {
        return { message: "已保存到本机，连接 Server 后将继续同步", error: false };
      }
    },
    { message: "", error: false } satisfies ProfileFormState,
  );

  return (
    <SettingsSection title="个人资料" description="用于 Studio Arona 中的账户显示。">
      <form action={formAction} className="space-y-0">
        <div className="grid gap-5 @2xl:grid-cols-2">
          <SettingField label="用户名">
            <input className={fieldClass} name="username" defaultValue={user?.username ?? ""} />
          </SettingField>
          <SettingField label="显示名">
            <input className={fieldClass} name="displayName" defaultValue={user?.display_name ?? ""} />
          </SettingField>
          <div className="sm:col-span-2">
            <SettingField label="头像 URL">
              <input className={fieldClass} name="avatarUrl" defaultValue={(user?.preferences as Record<string, string> | undefined)?.avatar_url ?? ""} />
            </SettingField>
          </div>
        </div>
        <ActionRow message={state.message ? { error: state.error, text: state.message } : null}>
          <Button type="submit" disabled={isPending}>
            <Save size={14} /> {isPending ? "保存中…" : "保存资料"}
          </Button>
        </ActionRow>
      </form>
    </SettingsSection>
  );
}

function SettingField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function ActionRow({
  message,
  children,
}: {
  message: { error: boolean; text: string } | null;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 flex min-h-9 items-center justify-between gap-4">
      {message ? (
        <p
          className={`flex items-center gap-1.5 text-xs ${message.error ? "text-red-600" : "text-emerald-600"}`}
        >
          {!message.error && <Check size={13} />}
          {message.text}
        </p>
      ) : (
        <span />
      )}
      {children}
    </div>
  );
}

function ChoiceRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 border-b border-[var(--color-border)] py-4 sm:flex-row sm:items-center">
      <span className="text-sm font-medium text-[var(--color-text-primary)]">
        {label}
      </span>
      <div className="inline-flex w-fit rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-1">
        {options.map(([id, text]) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${value === id ? "bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-3 text-sm">
      <dt className="text-[var(--color-text-muted)]">{label}</dt>
      <dd className="truncate text-[var(--color-text-primary)]">{value}</dd>
    </div>
  );
}
