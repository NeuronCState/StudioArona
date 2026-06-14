import { useState } from 'react';
import { Settings, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api/client';
import { Avatar, Dialog } from '@javis/ui-kit';

export function ProfileSettingsDialog() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState(user?.username ?? '');
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(
    () => (user?.preferences as Record<string, string> | undefined)?.avatar_url ?? '',
  );

  const handleOpen = () => {
    setUsername(user?.username ?? '');
    setDisplayName(user?.display_name ?? '');
    setAvatarUrl((user?.preferences as Record<string, string> | undefined)?.avatar_url ?? '');
    setError('');
    setOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    const newUsername = username.trim() || user.username;
    const newDisplay = displayName.trim() || user.display_name;
    const newPrefs = { ...(user.preferences as Record<string, unknown>), avatar_url: avatarUrl || null };
    setUser({ ...user, username: newUsername, display_name: newDisplay, preferences: newPrefs });
    setOpen(false);
    try {
      await Promise.all([
        api.patch('/me', { username: newUsername, display_name: newDisplay }),
        api.patch('/me/preferences', { key: 'avatar_url', value: avatarUrl || null }),
      ]);
    } catch {
      // local save succeeded; backend sync is best-effort
    }
    setSaving(false);
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
        title="Profile Settings"
        description="Edit your profile information."
        className="max-w-sm"
      >
        <button
          onClick={() => setOpen(false)}
          className="mb-3 flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <div className="space-y-4">
          <div className="flex justify-center">
            <Avatar
              alt={displayName || user?.display_name || 'User'}
              src={avatarUrl || undefined}
              size="lg"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              className="input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Display Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
              className="input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Avatar URL</label>
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

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setOpen(false)} className="btn-secondary text-xs">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-xs">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
