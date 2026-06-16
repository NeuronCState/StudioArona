import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface HermesProviderConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface HermesConfigState {
  providers: HermesProviderConfig[];
  activeProviderIndex: number;
  setupComplete: boolean;
  addProvider: (config: HermesProviderConfig) => void;
  updateProvider: (index: number, config: HermesProviderConfig) => void;
  removeProvider: (index: number) => void;
  setActiveProvider: (index: number) => void;
  markSetupComplete: () => void;
  getActiveProvider: () => HermesProviderConfig;
}

const DEFAULT_CONFIG: HermesProviderConfig = {
  baseUrl: 'http://127.0.0.1:8645',
  model: 'gpt-4o-mini',
  apiKey: 'local-hermes',
};

export const useHermesConfigStore = create<HermesConfigState>()(
  persist(
    (set, get) => ({
      providers: [{ ...DEFAULT_CONFIG }],
      activeProviderIndex: 0,
      setupComplete: false,

      addProvider: (config) =>
        set((state) => ({
          providers: [...state.providers, config],
        })),

      updateProvider: (index, config) =>
        set((state) => ({
          providers: state.providers.map((p, i) => (i === index ? config : p)),
        })),

      removeProvider: (index) =>
        set((state) => {
          const newProviders = state.providers.filter((_, i) => i !== index);
          return {
            providers: newProviders.length > 0 ? newProviders : [{ ...DEFAULT_CONFIG }],
            activeProviderIndex: Math.min(state.activeProviderIndex, newProviders.length - 1),
          };
        }),

      setActiveProvider: (index) => set({ activeProviderIndex: index }),

      markSetupComplete: () => set({ setupComplete: true }),

      getActiveProvider: () => {
        const state = get();
        return state.providers[state.activeProviderIndex] ?? DEFAULT_CONFIG;
      },
    }),
    {
      name: 'studio-arona-hermes-config',
      partialize: (state) => ({
        providers: state.providers,
        activeProviderIndex: state.activeProviderIndex,
        setupComplete: state.setupComplete, // 显式持久化 setupComplete, 避免 markSetupComplete 改 zustand persist 版本
      }),
    },
  ),
);
