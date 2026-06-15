import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Plus, Trash2, ArrowRight, Check } from 'lucide-react';
import { useHermesConfigStore, type HermesProviderConfig } from '@/stores/hermes-config';

const PRESETS: { label: string; config: HermesProviderConfig }[] = [
  {
    label: '本地 Hermes (默认)',
    config: { baseUrl: 'http://127.0.0.1:8645', model: 'gpt-4o-mini', apiKey: 'local-hermes' },
  },
  {
    label: 'MiniMax CN',
    config: { baseUrl: 'https://api.minimax.chat', model: 'MiniMax-M2.5-highspeed', apiKey: '' },
  },
  {
    label: 'OpenAI',
    config: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' },
  },
  {
    label: 'DeepSeek',
    config: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: '' },
  },
];

export function SetupPage() {
  const { providers, addProvider, removeProvider, setActiveProvider, markSetupComplete } =
    useHermesConfigStore();
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<HermesProviderConfig>({
    baseUrl: '',
    model: '',
    apiKey: '',
  });

  const handleAdd = () => {
    addProvider(form);
    setForm({ baseUrl: '', model: '', apiKey: '' });
    setEditing(null);
  };

  const handlePreset = (preset: HermesProviderConfig) => {
    addProvider(preset);
  };

  const handleSkip = () => {
    markSetupComplete();
  };

  const handleComplete = () => {
    markSetupComplete();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-lg"
      >
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-accent)] shadow-lg">
              <Bot size={32} className="text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            配置 AI 服务
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            连接到你的 LLM 供应商，阿洛娜才能和你对话
          </p>
        </div>

        {/* Presets */}
        <div className="mb-6">
          <p className="mb-3 text-xs font-medium text-[var(--color-text-muted)]">快速添加</p>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePreset(preset.config)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-left text-sm transition-colors hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-accent-soft)]"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Added providers */}
        {providers.length > 0 && (
          <div className="mb-6">
            <p className="mb-3 text-xs font-medium text-[var(--color-text-muted)]">已添加的供应商</p>
            <div className="space-y-2">
              {providers.map((p, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                      {p.baseUrl}
                    </p>
                    <p className="truncate text-xs text-[var(--color-text-muted)]">
                      模型: {p.model}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveProvider(i)}
                    className={`rounded-lg px-2 py-1 text-xs transition-colors ${
                      i === providers.length - 1
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    使用
                  </button>
                  <button
                    onClick={() => removeProvider(i)}
                    className="rounded-lg p-1 text-[var(--color-text-muted)] hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Custom add */}
        {editing !== null ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-6 space-y-3 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-surface)] p-4"
          >
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">API 地址</label>
              <input
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="https://api.example.com/v1"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">模型名称</label>
              <input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="gpt-4o-mini"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">API Key</label>
              <input
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="sk-..."
                type="password"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              >
                取消
              </button>
              <button
                onClick={handleAdd}
                disabled={!form.baseUrl || !form.model}
                className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
              >
                添加
              </button>
            </div>
          </motion.div>
        ) : (
          <button
            onClick={() => setEditing(0)}
            className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] py-3 text-sm text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            <Plus size={16} />
            自定义添加供应商
          </button>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            跳过，稍后配置
          </button>
          <button
            onClick={handleComplete}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            <Check size={16} />
            完成
            <ArrowRight size={16} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
