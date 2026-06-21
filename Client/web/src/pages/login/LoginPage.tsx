/**
 * LoginPage — React 19 useActionState + <form action> 模式。
 *
 * 迁移自 react-hook-form + zodResolver + useMutation:
 *   - loginForm / registerForm 各自用 useActionState 管理状态
 *   - <form action={formAction}> 替代 onSubmit + handleSubmit
 *   - Zod schema 从 @/lib/schemas 引用
 *   - 每个 form 内部展示自己的 error (替代外部 ErrorBanner)
 */
import { useActionState, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { loginSchema, registerSchema } from "@/lib/schemas";
import type { LoginInput, RegisterInput } from "@/lib/schemas";
import { api } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth";
import type { UserProfile } from "@/types/contracts";
import { useSonettoConfigStore } from "@/stores/sonetto-config";
import { Spinner } from "@javis/ui-kit";
import { LoginBackdrop } from "@/components/effects/LoginBackdrop";
import { db } from "@/lib/db";
import { useT } from "@/lib/i18n";
import * as storage from "@/lib/storage";

async function clearAllUserData(): Promise<{ hadData: boolean }> {
  const tables = [
    "schedules",
    "feeds",
    "feedItems",
    "memories",
    "skills",
    "weather",
    "system",
  ] as const;
  let hadData = false;
  for (const t of tables) {
    // IDB 端清理 (Web / Tauri WebView 通用)
    try {
      const idbCount = await db.table(t).count();
      if (idbCount > 0) hadData = true;
      await db.table(t).clear();
    } catch {
      // IDB 表可能不存在
    }
    // Tauri 桌面端: FS 存储后端同步清理
    try {
      await storage.clear(t);
    } catch {
      // FS 目录可能不存在
    }
  }
  return { hadData };
}

const presetAvatars = [
  { id: "cat", emoji: "🐱", label: "猫咪" },
  { id: "dog", emoji: "🐶", label: "小狗" },
  { id: "fox", emoji: "🦊", label: "狐狸" },
  { id: "panda", emoji: "🐼", label: "熊猫" },
  { id: "rabbit", emoji: "🐰", label: "兔子" },
  { id: "bear", emoji: "🐻", label: "小熊" },
];

interface FormState {
  error: string;
}

// ── Login form ──
function LoginForm() {
  const tr = useT();
  const login = useAuthStore((s) => s.login);

  const [state, formAction, isPending] = useActionState(
    async (_prev: FormState, formData: FormData) => {
      const raw: LoginInput = {
        username: formData.get("username") as string,
        password: formData.get("password") as string,
      };
      const result = loginSchema.safeParse(raw);
      if (!result.success) return { error: tr("login.error.credentials") };

      try {
        const data = await api.post<{
          access_token: string;
          refresh_token: string;
          user: UserProfile;
        }>("/auth/login", result.data);
        login(data.access_token, data.refresh_token, data.user);
        return { error: "" };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("offline") || msg.includes("unreachable") || msg.includes("not in online mode")) {
          return { error: tr("login.error.serverOffline") };
        }
        return { error: tr("login.error.credentials") };
      }
    },
    { error: "" } satisfies FormState,
  );

  return (
    <motion.form
      key="login"
      action={formAction}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="space-y-4"
    >
      {state.error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="animate-shake rounded-lg border border-[var(--color-error)] bg-[var(--color-error)]/5 px-4 py-2.5 text-sm text-[var(--color-error)]"
        >
          {state.error}
        </motion.div>
      )}

      <div>
        <label htmlFor="login-username" className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">
          {tr("login.username")}
        </label>
        <input id="login-username" name="username" className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] transition-colors" autoComplete="username" placeholder={tr("login.usernamePlaceholder")} defaultValue="" />
      </div>

      <div>
        <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">
          {tr("login.password")}
        </label>
        <input id="login-password" name="password" type="password" className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] transition-colors" autoComplete="current-password" placeholder={tr("login.passwordPlaceholder")} defaultValue="" />
      </div>

      <button type="submit" disabled={isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 disabled:opacity-60">
        {isPending ? <Spinner size="sm" /> : tr("login.submit")}
      </button>
    </motion.form>
  );
}

// ── Register form ──
function RegisterForm() {
  const tr = useT();
  const login = useAuthStore((s) => s.login);
  const [selectedAvatar, setSelectedAvatar] = useState("");

  const [state, formAction, isPending] = useActionState(
    async (_prev: FormState, formData: FormData) => {
      const raw: RegisterInput = {
        username: formData.get("username") as string,
        displayName: formData.get("displayName") as string,
        password: formData.get("password") as string,
      };
      const result = registerSchema.safeParse(raw);
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        return { error: firstIssue?.message ?? tr("login.error.credentials") };
      }

      try {
        // admin/admin123 特殊路径: 不连 server, 直接本地注册
        if (raw.username === "admin" && raw.password === "admin123") {
          await clearAllUserData();
          login(
            `admin-local-token-${Date.now()}`,
            `admin-local-refresh-${Date.now()}`,
            {
              id: "admin",
              username: "admin",
              display_name: raw.displayName || "Admin",
              role: "admin",
              created_at: new Date().toISOString(),
              preferences: {},
              face_enrolled: false,
            } as UserProfile,
            { local: true },
          );
          useSonettoConfigStore.getState().markSetupComplete();
          window.location.href = "/";
          return { error: "" };
        }

        const data = await api.post<{
          access_token: string;
          refresh_token: string;
          user: UserProfile;
        }>("/auth/register", {
          username: raw.username,
          display_name: raw.displayName,
          password: raw.password,
          avatar: formData.get("avatar") || undefined,
        });
        login(data.access_token, data.refresh_token, data.user);
        return { error: "" };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("offline") || msg.includes("unreachable") || msg.includes("not in online mode")) {
          return { error: tr("login.error.serverOffline") };
        }
        return { error: tr("login.error.credentials") };
      }
    },
    { error: "" } satisfies FormState,
  );

  return (
    <motion.form
      key="register"
      action={formAction}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="space-y-4"
    >
      {state.error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="animate-shake rounded-lg border border-[var(--color-error)] bg-[var(--color-error)]/5 px-4 py-2.5 text-sm text-[var(--color-error)]"
        >
          {state.error}
        </motion.div>
      )}

      <input type="hidden" name="avatar" value={selectedAvatar || ""} />

      <div>
        <label htmlFor="reg-username" className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">{tr("login.username")}</label>
        <input id="reg-username" name="username" className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] transition-colors" autoComplete="username" placeholder={tr("login.usernamePlaceholder")} defaultValue="" />
      </div>

      <div>
        <label htmlFor="reg-display" className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">{tr("login.displayName")}</label>
        <input id="reg-display" name="displayName" className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] transition-colors" autoComplete="name" placeholder={tr("login.displayNamePlaceholder")} defaultValue="" />
      </div>

      <div>
        <label htmlFor="reg-password" className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]">{tr("login.password")}</label>
        <input id="reg-password" name="password" type="password" className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] transition-colors" autoComplete="new-password" placeholder={tr("login.passwordMinHint")} defaultValue="" />
      </div>

      {/* Avatar picker */}
      <div>
        <p className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">
          选择头像
        </p>
        <div className="grid grid-cols-6 gap-2">
          {presetAvatars.map((avatar) => (
            <button
              key={avatar.id}
              type="button"
              onClick={() => setSelectedAvatar(avatar.id)}
              className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg transition-all ${
                selectedAvatar === avatar.id
                  ? "ring-2 ring-[var(--color-accent)] bg-[var(--color-accent-soft)] scale-110"
                  : "bg-[var(--color-bg)] hover:bg-[var(--color-accent-soft)]"
              }`}
              title={avatar.label}
            >
              {avatar.emoji}
            </button>
          ))}
        </div>
      </div>

      <button type="submit" disabled={isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 disabled:opacity-60">
        {isPending ? <Spinner size="sm" /> : tr("login.registerSubmit")}
      </button>
    </motion.form>
  );
}

// ── Page ──
export function LoginPage() {
  const tr = useT();
  const [mode, setMode] = useState<"login" | "register">("login");

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      {/* Left: Brand area */}
      <div className="relative hidden flex-1 items-center justify-center lg:flex overflow-hidden">
        <LoginBackdrop />
        <div className="relative z-10 text-center max-w-sm px-8">
          <div className="mb-8 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-accent)] shadow-[var(--shadow-2)] hover:scale-105 hover:rotate-3 transition-transform duration-300">
              <span className="text-3xl font-serif font-bold text-white">A</span>
            </div>
          </div>
          <h1 className="font-serif text-3xl font-semibold text-[var(--color-text-primary)]">
            {tr("login.brand.title")}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            {tr("login.brand.subtitle")}
          </p>
        </div>
      </div>

      {/* Right: Form card */}
      <div className="flex w-full items-center justify-center lg:w-[480px] p-6 sm:p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex justify-center lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent)]">
              <span className="text-xl font-serif font-bold text-white">A</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-6 flex rounded-xl bg-[var(--color-bg)] p-1">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                mode === "login"
                  ? "bg-[var(--color-surface)] shadow-[var(--shadow-1)] text-[var(--color-text-primary)] font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {tr("login.title")}
            </button>
            <button
              onClick={() => setMode("register")}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                mode === "register"
                  ? "bg-[var(--color-surface)] shadow-[var(--shadow-1)] text-[var(--color-text-primary)] font-semibold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {tr("login.register")}
            </button>
          </div>

          {/* Forms with transition */}
          <AnimatePresence mode="wait">
            {mode === "login" ? <LoginForm /> : <RegisterForm />}
          </AnimatePresence>
        </div>
      </div>

      {/* Dev mode: 离线登录 */}
      {import.meta.env.DEV ? (
        <button
          type="button"
          onClick={() => {
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
              } satisfies UserProfile,
              { local: true },
            );
            useSonettoConfigStore.getState().markSetupComplete();
            window.location.href = "/";
          }}
          className="fixed bottom-4 right-4 z-50 rounded-full border border-stone-300 bg-white/90 px-4 py-2 text-xs font-medium text-stone-600 shadow-sm backdrop-blur-sm transition-colors hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800/90 dark:text-stone-300 dark:hover:bg-stone-700"
          title="不需要 server, 直接进首页 (dev only)"
        >
          🔓 离线登录 (dev)
        </button>
      ) : null}
    </div>
  );
}
