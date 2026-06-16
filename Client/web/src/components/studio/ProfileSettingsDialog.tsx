import { useState } from 'react';
import { Settings, Plus, Trash2, Bot, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api/client';
import {
  useSonettoConfigStore,
  SONETTO_PRESETS,
  type SonettoProviderConfig,
} from '@/stores/sonetto-config';
import { Avatar, Dialog, Button } from '@javis/ui-kit';

export function ProfileSettingsDialog() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const {
    providers,
    activeProviderId,
    sonettoBaseUrl,
    sonettoReady,
    setSonettoBaseUrl,
    addProvider,
    updateProvider,
    removeProvider,
    setActiveProvider,
    syncToSonetto,
  } = useSonettoConfigStore();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'profile' | 'sonetto'>('profile');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState(user?.username ?? '');
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(
    () => (user?.preferences as Record<string, string> | undefined)?.avatar_url ?? '',
  );
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [providerForm, setProviderForm] = useState<SonettoProviderConfig>({
    id: '',
    provider_type: 'openai',
    label: '',
    api_key: '',
    base_url: '',
    models: [],
    context_window: 32000,
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
    } finally {
      setSaving(false);
    }
  };

  const handleAddPreset = async (preset: SonettoProviderConfig) => {
    addProvider(preset);
    if (providers.length === 0) {
      setActiveProvider(preset.id);
    }
    // 立刻推 SonettoHere
    try {
      await syncToSonetto();
    } catch {
      /* ignore, user can retry */
    }
  };

  const handleAddCustom = () => {
    const id = `custom-${Date.now()}`;
    const newConfig: SonettoProviderConfig = {
      id,
      provider_type: 'openai',
      label: '自定义',
      api_key: '',
      base_url: '',
      models: [],
      context_window: 32000,
    };
    setProviderForm(newConfig);
    setEditingProvider(id);
  };

  const handleSaveProvider = async () => {
    if (!providerForm.id) return;
    if (providers.find((p) => p.id === providerForm.id)) {
      updateProvider(providerForm.id, providerForm);
    } else {
      addProvider(providerForm);
      setActiveProvider(providerForm.id);
    }
    setEditingProvider(null);
    // 立刻推 SonettoHere
    try {
      await syncToSonetto();
    } catch {
      /* ignore */
    }
  };

  const handleRemoveProvider = async (id: string) => {
    removeProvider(id);
    if (id === activeProviderId && providers.length > 1) {
      const next = providers.find((p) => p.id !== id);
      if (next) {
        setActiveProvider(next.id);
        try {
          await syncToSonetto();
        } catch {
          /* ignore */
        }
      }
    }
  };

  const handleSetActive = async (id: string) => {
    setActiveProvider(id);
    try {
      await syncToSonetto();
    } catch {
      /* ignore */
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncToSonetto();
      setError('');
    } catch (e) {
      setError(`同步 SonettoHere 失败: ${(e as Error).message}. 请确认 SonettoHere 已启动 (${sonettoBaseUrl})`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="rounded-md p-1.5 text-stone-400 hover:bg-stone-700 hover:text-stone-100"
        aria-label="Settings"
      >
        <Settings size={16} />
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="设置"
        description="个人资料 · LLM 提供商"
      >
      <div className="flex gap-1 border-b border-stone-200 px-4 pt-2 dark:border-stone-700">
        <button
          onClick={() => setTab('profile')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'profile'
              ? 'border-b-2 border-amber-500 text-amber-600'
              : 'text-stone-500 hover:text-stone-700 dark:text-stone-400'
          }`}
        >
          个人资料
        </button>
        <button
          onClick={() => setTab('sonetto')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'sonetto'
              ? 'border-b-2 border-amber-500 text-amber-600'
              : 'text-stone-500 hover:text-stone-700 dark:text-stone-400'
          }`}
        >
          LLM 提供商
        </button>
      </div>

      {tab === 'profile' ? (
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            <Avatar src={avatarUrl} alt={displayName || username} size="lg" />
            <div className="flex-1">
              <label className="text-xs text-stone-500">头像 URL</label>
              <input
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-stone-500">用户名</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-800"
            />
          </div>
          <div>
            <label className="text-xs text-stone-500">显示名</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-800"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <div className="rounded-md border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-800/50">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Bot size={14} className="text-amber-500" />
                <span>SonettoHere 后端</span>
                {sonettoReady === true && <CheckCircle2 size={14} className="text-emerald-500" />}
                {sonettoReady === false && <XCircle size={14} className="text-red-500" />}
                {sonettoReady === null && <Loader2 size={14} className="animate-spin text-stone-400" />}
              </div>
              <Button size="sm" variant="ghost" onClick={handleSync} disabled={syncing}>
                {syncing ? '同步中…' : '同步到 SonettoHere'}
              </Button>
            </div>
            <input
              value={sonettoBaseUrl}
              onChange={(e) => setSonettoBaseUrl(e.target.value)}
              placeholder="http://127.0.0.1:8081"
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-900"
            />
            <p className="mt-1 text-xs text-stone-500">
              LangGraph ReAct agent 框架, 30+ 内置 tool + 50+ MCP tool, SubAgent 隔离上下文。
            </p>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-stone-600 dark:text-stone-400">预设提供商</div>
            <div className="grid grid-cols-2 gap-1.5">
              {SONETTO_PRESETS.map((p) => (
                <button
                  key={p.config.id}
                  onClick={() => handleAddPreset(p.config)}
                  className="rounded border border-stone-200 bg-white px-2 py-1.5 text-left text-xs hover:border-amber-500 dark:border-stone-700 dark:bg-stone-800"
                >
                  <div className="font-medium">{p.label}</div>
                  <div className="truncate text-stone-500">{p.config.base_url || '自定义'}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <div className="text-xs font-medium text-stone-600 dark:text-stone-400">已添加</div>
              <Button size="sm" variant="ghost" onClick={handleAddCustom}>
                <Plus size={12} /> 自定义
              </Button>
            </div>
            <div className="space-y-1.5">
              {providers.length === 0 && (
                <p className="text-xs text-stone-500">尚未添加, 点上面预设或自定义</p>
              )}
              {providers.map((p) => (
                <div
                  key={p.id}
                  className={`rounded border p-2 ${
                    p.id === activeProviderId
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800'
                  }`}
                >
                  {editingProvider === p.id ? (
                    <div className="space-y-1.5">
                      <input
                        placeholder="标签"
                        value={providerForm.label}
                        onChange={(e) => setProviderForm({ ...providerForm, label: e.target.value })}
                        className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-900"
                      />
                      <input
                        placeholder="Base URL"
                        value={providerForm.base_url}
                        onChange={(e) => setProviderForm({ ...providerForm, base_url: e.target.value })}
                        className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-900"
                      />
                      <input
                        placeholder="API Key"
                        type="password"
                        value={providerForm.api_key}
                        onChange={(e) => setProviderForm({ ...providerForm, api_key: e.target.value })}
                        className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-900"
                      />
                      <input
                        placeholder="模型 (逗号分隔)"
                        value={providerForm.models.join(',')}
                        onChange={(e) =>
                          setProviderForm({
                            ...providerForm,
                            models: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                          })
                        }
                        className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-900"
                      />
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setEditingProvider(null)}>
                          取消
                        </Button>
                        <Button size="sm" onClick={handleSaveProvider}>
                          保存
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-medium">{p.label}</span>
                          {p.id === activeProviderId && (
                            <span className="rounded bg-amber-500 px-1 text-[10px] text-white">当前</span>
                          )}
                        </div>
                        <div className="truncate text-[10px] text-stone-500">{p.base_url}</div>
                        <div className="truncate text-[10px] text-stone-500">{p.models.join(', ')}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {p.id !== activeProviderId && (
                          <button
                            onClick={() => handleSetActive(p.id)}
                            className="rounded px-1.5 py-0.5 text-[10px] text-amber-600 hover:bg-amber-100"
                          >
                            启用
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setProviderForm(p);
                            setEditingProvider(p.id);
                          }}
                          className="rounded p-1 text-stone-400 hover:bg-stone-100"
                        >
                          <Settings size={12} />
                        </button>
                        <button
                          onClick={() => handleRemoveProvider(p.id)}
                          className="rounded p-1 text-stone-400 hover:bg-red-100 hover:text-red-500"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              完成
            </Button>
          </div>
        </div>
      )}
      </Dialog>
    </>
  );
}
