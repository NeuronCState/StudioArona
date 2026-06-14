import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth';
import { Spinner } from '@javis/ui-kit';
import { LoginBackdrop } from '@/components/effects/LoginBackdrop';
import type { UserProfile } from '@/types/contracts';

const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
});

const registerSchema = z.object({
  username: z.string().min(2, '用户名至少 2 个字符'),
  displayName: z.string().min(1, '请输入显示名'),
  password: z.string().min(6, '密码至少 6 位'),
  invitationCode: z.string().min(1, '请输入识别码'),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

const presetAvatars = [
  { id: 'cat', emoji: '🐱', label: '猫咪' },
  { id: 'dog', emoji: '🐶', label: '小狗' },
  { id: 'fox', emoji: '🦊', label: '狐狸' },
  { id: 'panda', emoji: '🐼', label: '熊猫' },
  { id: 'rabbit', emoji: '🐰', label: '兔子' },
  { id: 'bear', emoji: '🐻', label: '小熊' },
];

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [selectedAvatar, setSelectedAvatar] = useState('');
  const [shakeKey, setShakeKey] = useState(0);

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const loginMutation = useMutation({
    mutationFn: (data: LoginForm) =>
      api.post<{ access_token: string; refresh_token: string; user: UserProfile }>(
        '/auth/login',
        data,
      ),
    onSuccess: (data) => login(data.access_token, data.refresh_token, data.user),
    onError: () => setShakeKey((k) => k + 1),
  });

  const registerMutation = useMutation({
    mutationFn: (data: RegisterForm) =>
      api.post<{ access_token: string; refresh_token: string; user: UserProfile }>(
        '/auth/register',
        {
          username: data.username,
          display_name: data.displayName,
          password: data.password,
          invitation_code: data.invitationCode,
          avatar: selectedAvatar || undefined,
        },
      ),
    onSuccess: (data) => login(data.access_token, data.refresh_token, data.user),
    onError: () => setShakeKey((k) => k + 1),
  });

  const isPending = loginMutation.isPending || registerMutation.isPending;
  const isError = loginMutation.isError || registerMutation.isError;

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
            什亭之匣 · 阿洛娜
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            Shtin Box · Arona，你的智能工作室伙伴。
            <br />
            管理 NAS、虚拟机、RSS 订阅，记住每一个来过的人。
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
              onClick={() => setMode('login')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                mode === 'login'
                  ? 'bg-[var(--color-surface)] shadow-[var(--shadow-1)] text-[var(--color-text-primary)] font-semibold'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              登录
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                mode === 'register'
                  ? 'bg-[var(--color-surface)] shadow-[var(--shadow-1)] text-[var(--color-text-primary)] font-semibold'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              注册
            </button>
          </div>

          {/* Error banner */}
          {isError && (
            <div
              key={shakeKey}
              className="mb-4 animate-shake rounded-lg border border-[var(--color-error)] bg-[var(--color-error)]/5 px-4 py-2.5 text-sm text-[var(--color-error)]"
            >
              {mode === 'login'
                ? '登录失败，请检查用户名和密码'
                : '注册失败，请检查识别码或稍后重试'}
            </div>
          )}

          {/* Login form */}
          {mode === 'login' && (
            <form
              onSubmit={loginForm.handleSubmit((data) => loginMutation.mutate(data))}
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="login-username"
                  className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]"
                >
                  用户名
                </label>
                <input
                  id="login-username"
                  {...loginForm.register('username')}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] transition-colors"
                  autoComplete="username"
                  placeholder="输入用户名"
                />
                {loginForm.formState.errors.username && (
                  <p className="mt-1 text-xs text-[var(--color-error)]">
                    {loginForm.formState.errors.username.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]"
                >
                  密码
                </label>
                <input
                  id="login-password"
                  type="password"
                  {...loginForm.register('password')}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] transition-colors"
                  autoComplete="current-password"
                  placeholder="输入密码"
                />
                {loginForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-[var(--color-error)]">
                    {loginForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {isPending ? <Spinner size="sm" /> : '登录'}
              </button>
            </form>
          )}

          {/* Register form */}
          {mode === 'register' && (
            <form
              onSubmit={registerForm.handleSubmit((data) => registerMutation.mutate(data))}
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="reg-username"
                  className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]"
                >
                  用户名
                </label>
                <input
                  id="reg-username"
                  {...registerForm.register('username')}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] transition-colors"
                  autoComplete="username"
                  placeholder="输入用户名"
                />
                {registerForm.formState.errors.username && (
                  <p className="mt-1 text-xs text-[var(--color-error)]">
                    {registerForm.formState.errors.username.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="reg-display"
                  className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]"
                >
                  显示名
                </label>
                <input
                  id="reg-display"
                  {...registerForm.register('displayName')}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] transition-colors"
                  autoComplete="name"
                  placeholder="你的名字"
                />
                {registerForm.formState.errors.displayName && (
                  <p className="mt-1 text-xs text-[var(--color-error)]">
                    {registerForm.formState.errors.displayName.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="reg-password"
                  className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]"
                >
                  密码
                </label>
                <input
                  id="reg-password"
                  type="password"
                  {...registerForm.register('password')}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] transition-colors"
                  autoComplete="new-password"
                  placeholder="至少 6 位"
                />
                {registerForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-[var(--color-error)]">
                    {registerForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              {/* Invitation code */}
              <div>
                <label
                  htmlFor="reg-code"
                  className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]"
                >
                  识别码
                </label>
                <input
                  id="reg-code"
                  {...registerForm.register('invitationCode')}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] transition-colors"
                  autoComplete="off"
                  placeholder="输入识别码"
                />
                {registerForm.formState.errors.invitationCode && (
                  <p className="mt-1 text-xs text-[var(--color-error)]">
                    {registerForm.formState.errors.invitationCode.message}
                  </p>
                )}
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
                          ? 'ring-2 ring-[var(--color-accent)] bg-[var(--color-accent-soft)] scale-110'
                          : 'bg-[var(--color-bg)] hover:bg-[var(--color-accent-soft)]'
                      }`}
                      title={avatar.label}
                    >
                      {avatar.emoji}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {isPending ? <Spinner size="sm" /> : '注册'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
