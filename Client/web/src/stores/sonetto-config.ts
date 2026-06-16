/**
 * useSonettoConfigStore — LLM provider 配置 (对齐 SonettoHere schema)
 *
 * 拍板 (2026-06-16):
 * - 替代 useHermesConfigStore (Hermes 拆掉, SonettoHere 整端当 agent 框架)
 * - 字段直接对齐 SonettoHere ProviderConfig (id / provider_type / label / api_key /
 *   base_url / models / enabled / context_window), 减少翻译层
 * - 旧 Hermes store 字段在 onRehydrateStorage 迁移, 用户已配的不丢
 * - 4 个 preset: MiniMax / OpenAI / DeepSeek / 自定义 (跟 SonettoHere 默认 providers 对齐)
 * - syncToSonetto(): 把 active provider 推送到 SonettoHere /api/providers,
 *   SonettoHere 0 改, 写它自己的 providers.yaml
 *
 * 旧 useHermesConfigStore 字段: providers[] { baseUrl, model, apiKey } + activeProviderIndex
 * 新 useSonettoConfigStore 字段: providers[] { id, provider_type, label, api_key, base_url, models[], context_window }
 *   + activeProviderId + sonettoBaseUrl + sonettoReady + syncToSonetto()
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SonettoProviderConfig {
  id: string;
  provider_type: 'openai' | string;
  label: string;
  api_key: string;
  base_url: string;
  models: string[];
  context_window?: number;
}

export interface SonettoProviderPreset {
  label: string;
  config: SonettoProviderConfig;
}

interface SonettoConfigState {
  providers: SonettoProviderConfig[];
  activeProviderId: string;
  setupComplete: boolean;
  /** SonettoHere 后端地址 (默认本地 8081) */
  sonettoBaseUrl: string;
  sonettoReady: boolean | null;

  setSonettoBaseUrl: (url: string) => void;
  setSonettoReady: (ready: boolean | null) => void;
  addProvider: (config: SonettoProviderConfig) => void;
  updateProvider: (id: string, config: SonettoProviderConfig) => void;
  removeProvider: (id: string) => void;
  setActiveProvider: (id: string) => void;
  markSetupComplete: () => void;
  getActiveProvider: () => SonettoProviderConfig;
  /** 把 active provider 推送到 SonettoHere /api/providers */
  syncToSonetto: () => Promise<void>;
}

/** 4 个 preset — 跟 SonettoHere 默认 providers 对齐 (无本地 Hermes, 已拆) */
export const SONETTO_PRESETS: SonettoProviderPreset[] = [
  {
    label: 'MiniMax CN',
    config: {
      id: 'minimax-cn',
      provider_type: 'openai',
      label: 'MiniMax CN',
      api_key: '',
      base_url: 'https://api.minimax.chat/v1',
      models: ['MiniMax-M2.5-highspeed', 'MiniMax-M2.5'],
      context_window: 256000,
    },
  },
  {
    label: 'OpenAI',
    config: {
      id: 'openai',
      provider_type: 'openai',
      label: 'OpenAI',
      api_key: '',
      base_url: 'https://api.openai.com/v1',
      models: ['gpt-4o-mini', 'gpt-4o'],
      context_window: 128000,
    },
  },
  {
    label: 'DeepSeek',
    config: {
      id: 'deepseek',
      provider_type: 'openai',
      label: 'DeepSeek',
      api_key: '',
      base_url: 'https://api.deepseek.com/v1',
      models: ['deepseek-chat', 'deepseek-coder'],
      context_window: 64000,
    },
  },
  {
    label: '自定义',
    config: {
      id: 'custom',
      provider_type: 'openai',
      label: '自定义',
      api_key: '',
      base_url: '',
      models: [],
      context_window: 32000,
    },
  },
];

const DEFAULT_PROVIDER = SONETTO_PRESETS[0].config;

interface OldHermesProviderConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface OldHermesConfig {
  providers: OldHermesProviderConfig[];
  activeProviderIndex: number;
  setupComplete: boolean;
}

/** 旧 Hermes preset → SonettoHere 字段映射 (用户已配的不丢) */
const HERMES_PRESET_MAP: Record<string, SonettoProviderConfig> = {
  'http://127.0.0.1:8645': SONETTO_PRESETS[0].config, // 旧 "本地 Hermes" → 默认 MiniMax
  'https://api.minimax.chat': { ...SONETTO_PRESETS[0].config, base_url: 'https://api.minimax.chat/v1' },
  'https://api.openai.com/v1': { ...SONETTO_PRESETS[1].config, base_url: 'https://api.openai.com/v1' },
  'https://api.deepseek.com/v1': SONETTO_PRESETS[2].config,
};

function migrateOldHermes(old: OldHermesConfig | undefined): SonettoProviderConfig[] {
  if (!old?.providers?.length) return [DEFAULT_PROVIDER];
  return old.providers.map((p, i) => {
    const matched = HERMES_PRESET_MAP[p.baseUrl] ?? SONETTO_PRESETS[3].config; // 不匹配 → 自定义
    return {
      ...matched,
      id: i === 0 ? matched.id : `custom-${Date.now()}-${i}`,
      api_key: p.apiKey,
      models: p.model ? [p.model] : matched.models,
      base_url: p.baseUrl,
    };
  });
}

export const useSonettoConfigStore = create<SonettoConfigState>()(
  persist(
    (set, get) => ({
      providers: [DEFAULT_PROVIDER],
      activeProviderId: DEFAULT_PROVIDER.id,
      setupComplete: false,
      sonettoBaseUrl: 'http://127.0.0.1:8081',
      sonettoReady: null,

      setSonettoBaseUrl: (url) => set({ sonettoBaseUrl: url }),
      setSonettoReady: (ready) => set({ sonettoReady: ready }),

      addProvider: (config) =>
        set((state) => ({
          providers: [...state.providers, config],
        })),

      updateProvider: (id, config) =>
        set((state) => ({
          providers: state.providers.map((p) => (p.id === id ? config : p)),
        })),

      removeProvider: (id) =>
        set((state) => {
          const newProviders = state.providers.filter((p) => p.id !== id);
          const finalProviders = newProviders.length > 0 ? newProviders : [DEFAULT_PROVIDER];
          return {
            providers: finalProviders,
            activeProviderId:
              state.activeProviderId === id
                ? finalProviders[0].id
                : state.activeProviderId,
          };
        }),

      setActiveProvider: (id) => set({ activeProviderId: id }),
      markSetupComplete: () => set({ setupComplete: true }),

      getActiveProvider: () => {
        const state = get();
        return (
          state.providers.find((p) => p.id === state.activeProviderId) ??
          state.providers[0] ??
          DEFAULT_PROVIDER
        );
      },

      syncToSonetto: async () => {
        const { sonettoBaseUrl, getActiveProvider, providers, setSonettoReady } = get();
        try {
          // 推 active provider
          const active = getActiveProvider();
          const r1 = await fetch(`${sonettoBaseUrl}/api/providers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(active),
          });
          if (!r1.ok) throw new Error(`POST /api/providers failed: ${r1.status}`);
          // 也推其他 provider (SonettoHere 端单条管理)
          for (const p of providers) {
            if (p.id === active.id) continue;
            await fetch(`${sonettoBaseUrl}/api/providers`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(p),
            });
          }
          setSonettoReady(true);
        } catch (e) {
          setSonettoReady(false);
          throw e;
        }
      },
    }),
    {
      name: 'studio-arona-sonetto-config',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        providers: state.providers,
        activeProviderId: state.activeProviderId,
        setupComplete: state.setupComplete,
        sonettoBaseUrl: state.sonettoBaseUrl,
      }),
      // 旧 Hermes store 迁移: 读旧 key, 转新格式
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        try {
          const raw = localStorage.getItem('studio-arona-hermes-config');
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (parsed?.state?.providers?.length) {
            const migrated = migrateOldHermes(parsed.state);
            state.providers = migrated;
            state.activeProviderId = migrated[parsed.state.activeProviderIndex ?? 0]?.id ?? migrated[0].id;
            // 旧 key 不删, 用户能查, 但新写入只到新 key
          }
        } catch {
          /* 旧 key 不存在或损坏, 忽略 */
        }
      },
    },
  ),
);
