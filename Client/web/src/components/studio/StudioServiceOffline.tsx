import { ServerOff } from 'lucide-react';
import { useConnectionStore } from '@/stores/connection';

interface StudioServiceOfflineProps {
  /** 哪个服务: 'vms' | 'nas' | 'ha' — 决定副标题文案 */
  service: 'vms' | 'nas' | 'ha';
  /** 重试回调 (点了重连, server 重启后再次 query) */
  onRetry?: () => void;
}

const SERVICE_LABEL: Record<StudioServiceOfflineProps['service'], string> = {
  vms: '虚拟机',
  nas: 'NAS 存储',
  ha: 'HomeAssistant',
};

/**
 * 工作室服务离线占位 — 用于 VMS / NAS / HA 页面 + 磁贴
 *
 * 设计原则 (跟 v3 "本地优先 + 离线感知" 一致):
 * - 离线时**明确**告诉用户"未连接", 不让用户对空白或错误堆栈困惑
 * - 不提供"重试"按钮 (server 没起, 重试无意义) — 改成"如何连接"提示
 * - 在线时正常渲染数据
 */
export function StudioServiceOffline({ service, onRetry }: StudioServiceOfflineProps) {
  const effectiveMode = useConnectionStore(s => s.effectiveMode());
  if (effectiveMode === 'online') return null;

  const label = SERVICE_LABEL[service];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-100 dark:bg-stone-800">
        <ServerOff size={32} className="text-stone-400 dark:text-stone-500" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-stone-700 dark:text-stone-300">
          未连接 server
        </p>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {label}属于工作室服务, 需连接 server 后才能查看
        </p>
      </div>
      <div className="mt-2 max-w-sm space-y-1 text-left text-xs text-stone-400 dark:text-stone-500">
        <p>连接步骤:</p>
        <ol className="list-decimal space-y-0.5 pl-4">
          <li>确认 server 端运行: <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">cd Server/center && cargo run</code></li>
          <li>或打开 docker: <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">docker compose -f Server/infra/compose/docker-compose.yml up -d</code></li>
          <li>在左上角菜单 → 设置 → 工作室服务 连接 server</li>
        </ol>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
        >
          重新检测
        </button>
      ) : null}
    </div>
  );
}
