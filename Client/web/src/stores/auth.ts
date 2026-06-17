import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile } from '@/types/contracts';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  /**
   * 'server' = server 签发的真 JWT (默认, 可走 401/refresh 链)
   * 'local' = 本地 fake token (admin / dev bypass), client.ts 跳过 server 避免假 token 触发 logout
   */
  tokenMode: 'server' | 'local';
  login: (
    accessToken: string,
    refreshToken: string,
    user: UserProfile,
    opts?: { local?: boolean },
  ) => void;
  logout: () => void;
  setUser: (user: UserProfile) => void;
  /** 内部使用: refresh 成功后只更新 access token, 保留其他状态 */
  setAccessToken: (accessToken: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      tokenMode: 'server',
      login: (accessToken, refreshToken, user, opts) =>
        set({
          accessToken,
          refreshToken,
          user,
          isAuthenticated: true,
          tokenMode: opts?.local ? 'local' : 'server',
        }),
      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
          tokenMode: 'server',
        }),
      setUser: (user) => set({ user }),
      setAccessToken: (accessToken) => set({ accessToken }),
    }),
    {
      name: 'javis-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        tokenMode: state.tokenMode,
      }),
    },
  ),
);
