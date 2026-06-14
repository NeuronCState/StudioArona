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
        if (serverStatus === 'unknown') return 'online'; // default
        return serverStatus;
      },
    }),
    { name: 'studio-arona-connection' },
  ),
);
