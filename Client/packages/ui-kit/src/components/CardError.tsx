import { AlertTriangle, RefreshCw, ServerOff } from 'lucide-react';

export interface CardErrorProps {
  /** Error description shown to the user */
  message?: string;
  /** Retry callback — passed the error object so the parent can refetch */
  onRetry?: () => void;
  /** Optional additional class name */
  className?: string;
  /** Mark as offline (server not reachable). Renders muted stone tone + ServerOff icon. */
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
