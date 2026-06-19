import { AlertTriangle, RefreshCw, ServerOff } from 'lucide-react';

export interface CardErrorProps {
  /** Error description shown to the user */
  message?: string;
  /** Retry callback — passed the error object so the parent can refetch */
  onRetry?: () => void;
  /** Optional additional class name */
  className?: string;
  /**
   * @deprecated 用 OfflineBanner 替代 (inline 顶部条, 不挡 content).
   * 保留此 prop 是为了兼容老 page, 不要再用 offline=true.
   */
  offline?: boolean;
}

export function CardError({
  message,
  onRetry,
  className = '',
  offline = false,
}: CardErrorProps) {
  const displayMessage = offline
    ? '未连接 server, 显示本地数据'
    : (message ?? '数据加载失败，请稍后重试。');

  return (
    <div
      role="alert"
      className={`mx-auto flex max-w-md flex-col items-center justify-center rounded-xl border px-6 py-10 text-center shadow-sm backdrop-blur-sm ${
        offline
          ? 'border-stone-200 bg-stone-50/80 dark:border-stone-700 dark:bg-stone-800/40'
          : 'border-red-200 bg-red-50/80'
      } ${className}`}
    >
      <div
        className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
          offline ? 'bg-stone-100 dark:bg-stone-700' : 'bg-red-100'
        }`}
      >
        {offline ? (
          <ServerOff size={28} className="text-stone-500 dark:text-stone-400" />
        ) : (
          <AlertTriangle size={28} className="text-red-500" />
        )}
      </div>
      <p
        className={`text-sm font-medium ${
          offline ? 'text-stone-600 dark:text-stone-300' : 'text-red-700'
        }`}
      >
        {displayMessage}
      </p>
      {onRetry ? (
        <button
          onClick={onRetry}
          className={`mt-5 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
            offline
              ? 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50 active:bg-stone-100 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700'
              : 'border-red-300 bg-white text-red-700 hover:bg-red-50 active:bg-red-100'
          }`}
        >
          <RefreshCw size={14} />
          重试
        </button>
      ) : null}
    </div>
  );
}

/* ===== OfflineBanner =====
 * 顶部 inline 提示条, 不挡 page content. 当 server 不可达时, page 顶部显示.
 * 配合 useApiQuery 的 isOffline flag, 让 page 继续渲染 IDB / defaultData.
 */
export interface OfflineBannerProps {
  /** 提示文案 (默认: 未连接 server, 显示本地数据) */
  message?: string;
  /** 重试 callback */
  onRetry?: () => void;
  /** 自定义 class */
  className?: string;
}

export function OfflineBanner({
  message = '未连接 server, 显示本地数据',
  onRetry,
  className = '',
}: OfflineBannerProps) {
  return (
    <div
      role="status"
      className={`flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50/90 px-4 py-2 text-sm text-stone-600 backdrop-blur-sm dark:border-stone-700 dark:bg-stone-800/50 dark:text-stone-300 ${className}`}
    >
      <div className="flex items-center gap-2">
        <ServerOff size={16} className="shrink-0 text-stone-400" />
        <span>{message}</span>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1 rounded border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
        >
          <RefreshCw size={12} />
          重试
        </button>
      ) : null}
    </div>
  );
}
