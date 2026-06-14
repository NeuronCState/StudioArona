import { useState } from 'react';
import { ExternalLink, Copy, Check, HardDrive } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';

const NAS_URL = 'http://192.168.198.129:5666';

export function NasPage() {
  const user = useAuthStore((s) => s.user);
  const [copied, setCopied] = useState(false);

  const handleOpenNas = () => {
    // Use the auto-login endpoint — opens NAS with credential injection
    window.open('/api/nas/go', '_blank');
  };

  const handleOpenNasDirect = () => {
    window.open(NAS_URL, '_blank');
  };

  const handleCopyUser = async () => {
    try {
      await navigator.clipboard.writeText(user?.username || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6 rounded-2xl bg-surface-raised p-8 text-center shadow-lg">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
          <HardDrive size={32} className="text-accent" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-text">飞牛 NAS</h1>
          <p className="text-sm text-text-secondary">
            NAS 账号已在注册时自动创建，存储空间无限制。
          </p>
        </div>

        <div className="rounded-lg bg-surface p-4 space-y-2 text-left">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">NAS 地址</span>
            <span className="font-mono text-text text-xs">{NAS_URL}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">用户名</span>
            <span className="font-mono text-text">{user?.username || '—'}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">密码</span>
            <span className="text-text">与 Arona 相同</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">存储配额</span>
            <span className="text-accent">无限制</span>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleOpenNas}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            <ExternalLink size={16} />
            自动登录 NAS
          </button>
          <button
            onClick={handleOpenNasDirect}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-secondary transition-colors hover:bg-surface-raised"
          >
            <ExternalLink size={16} />
            直接打开 NAS
          </button>
          <button
            onClick={handleCopyUser}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-secondary transition-colors hover:bg-surface-raised"
          >
            {copied ? <Check size={16} className="text-accent" /> : <Copy size={16} />}
            {copied ? '已复制' : '复制用户名'}
          </button>
        </div>
      </div>
    </div>
  );
}
