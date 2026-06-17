import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ConnectionMode = 'auto' | 'online' | 'offline';

interface ConnectionState {
  /** Server-reported connection status */
  serverStatus: 'online' | 'offline' | 'unknown';
  setServerStatus: (s: 'online' | 'offline' | 'unknown') => void;

  /** User override: 'auto' = follow server, 'online' = force cloud, 'offline' = force local */
  userMode: ConnectionMode;
  setUserMode: (m: ConnectionMode) => void;

  /** Computed: actual effective mode */
  effectiveMode: () => 'online' | 'offline';
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      serverStatus: 'unknown',
      setServerStatus: (s) => set({ serverStatus: s }),

      userMode: 'auto',
      setUserMode: (m) => set({ userMode: m }),

      effectiveMode: () => {
        const { serverStatus, userMode } = get();
        if (userMode !== 'auto') return userMode;
        // 默认 offline: 启动时 / 不知道 server 状态时, 当 offline (本地数据为主, 不发请求)
        // useConnectionStatus 会 ping 8080/health, 通了再 setServerStatus('online')
        if (serverStatus === 'unknown') return 'offline';
        return serverStatus;
      },
    }),
    { name: 'studio-arona-connection' },
  ),
);
