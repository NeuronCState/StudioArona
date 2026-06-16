import { useState } from 'react';
import { Settings, ArrowLeft, Plus, Trash2, Bot } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api/client';
import { useHermesConfigStore, type HermesProviderConfig } from '@/stores/hermes-config';
import { Avatar, Dialog } from '@javis/ui-kit';

const PRESETS: { label: string; config: HermesProviderConfig }[] = [
  { label: '本地 Hermes', config: { baseUrl: 'http://127.0.0.1:8645', model: 'gpt-4o-mini', apiKey: 'local-hermes' } },
  { label: 'MiniMax CN', config: { baseUrl: 'https://api.minimax.chat', model: 'MiniMax-M2.5-highspeed', apiKey: '' } },
  { label: 'OpenAI', config: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' } },
  { label: 'DeepSeek', config: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: '' } },
];

export function ProfileSettingsDialog() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { providers, activeProviderIndex, addProvider, removeProvider, setActiveProvider } =
    useHermesConfigStore();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'profile' | 'hermes'>('profile');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState(user?.username ?? '');
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(
    () => (user?.preferences as Record<string, string> | undefined)?.avatar_url ?? '',
  );
  const [editingProvider, setEditingProvider] = useState<number | null>(null);
  const [providerForm, setProviderForm] = useState<HermesProviderConfig>({
    baseUrl: '',
    model: '',
    apiKey: '',
  });

  const handleOpen = () => {
    setUsername(user?.username ?? '');
    setDisplayName(user?.display_name ?? '');
    setAvatarUrl((user?.preferences as Record<string, string> | undefined)?.avatar_url ?? '');
    setError('');
    setTab('profile');
    setEditingProvider(null);
    setOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    const newUsername = username.trim() || user.username;
    const newDisplay = displayName.trim() || user.display_name;
    const newPrefs = { ...(user.preferences as Record<string, unknown>), avatar_url: avatarUrl || null };
    setUser({ ...user, username: newUsername, display_name: newDisplay, preferences: newPrefs });
    try {
      await Promise.all([
        api.patch('/me', { username: newUsername, display_name: newDisplay }),
        api.patch('/me/preferences', { key: 'avatar_url', value: avatarUrl || null }),
      ]);
    } catch {
      // local save succeeded
    }
    setSaving(false);
  };

  const handleAddProvider = () => {
    addProvider(providerForm);
    setProviderForm({ baseUrl: '', model: '', apiKey: '' });
    setEditingProvider(null);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="rounded-md p-1 transition-colors hover:opacity-70 shrink-0"
        style={{ color: 'var(--studio-text-muted)' }}
        aria-label="Profile settings"
      >
        <Settings size={14} />
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="设置"
        description="管理你的个人资料和 AI 服务配置"
        className="max-w-md"
      >
        <button
          onClick={() => setOpen(false)}
          className="mb-3 flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ArrowLeft size={14} />
          返回
        </button>

        {/* Tabs */}
        <div className="mb-4 flex rounded-lg bg-[var(--color-bg)] p-0.5">
          <button
            onClick={() => setTab('profile')}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
              tab === 'profile'
                ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            个人资料
          </button>
          <button
            onClick={() => setTab('hermes')}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
              tab === 'hermes'
                ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <span className="inline-flex items-center gap-1">
              <Bot size={12} />
              AI 服务
            </span>
          </button>
        </div>

        {tab === 'profile' ? (
          <div className="space-y-4">
            <div className="flex justify-center">
              <Avatar
                alt={displayName || user?.display_name || 'User'}
                src={avatarUrl || undefined}
                size="lg"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">用户名</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="用户名"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">显示名</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="显示名"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">头像 URL</label>
              <input
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="input"
              />
            </div>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
            )}
            <div className="flex justify-end pt-2">
              <button onClick={handleSaveProfile} disabled={saving} className="btn-primary text-xs">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Presets */}
            <div>
              <p className="mb-2 text-xs text-[var(--color-text-muted)]">快速添加</p>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => addProvider(preset.config)}
                    className="rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-xs transition-colors hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-accent-soft)]"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Provider list */}
            <div className="space-y-1.5">
              {providers.map((p, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                    i === activeProviderIndex
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-[var(--color-text-primary)]">{p.baseUrl}</p>
                    <p className="truncate text-[var(--color-text-muted)]">{p.model}</p>
                  </div>
                  <button
                    onClick={() => setActiveProvider(i)}
                    className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                      i === activeProviderIndex
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    {i === activeProviderIndex ? '使用中' : '切换'}
                  </button>
                  <button
                    onClick={() => removeProvider(i)}
                    className="rounded p-0.5 text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>

            {/* Add custom */}
            {editingProvider !== null ? (
              <div className="space-y-2 rounded-lg border border-[var(--color-accent)]/30 p-3">
                <input
                  value={providerForm.baseUrl}
                  onChange={(e) => setProviderForm({ ...providerForm, baseUrl: e.target.value })}
                  placeholder="API 地址"
                  className="input text-xs"
                />
                <input
                  value={providerForm.model}
                  onChange={(e) => setProviderForm({ ...providerForm, model: e.target.value })}
                  placeholder="模型名称"
                  className="input text-xs"
                />
                <input
                  value={providerForm.apiKey}
                  onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })}
                  placeholder="API Key"
                  type="password"
                  className="input text-xs"
                />
                <div className="flex justify-end gap-1.5">
                  <button onClick={() => setEditingProvider(null)} className="text-xs text-[var(--color-text-muted)]">
                    取消
                  </button>
                  <button
                    onClick={handleAddProvider}
                    disabled={!providerForm.baseUrl || !providerForm.model}
                    className="rounded bg-[var(--color-accent)] px-2 py-1 text-xs text-white disabled:opacity-50"
                  >
                    添加
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingProvider(0)}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--color-border)] py-2 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
              >
                <Plus size={12} />
                自定义添加
              </button>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
