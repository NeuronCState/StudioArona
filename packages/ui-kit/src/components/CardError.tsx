import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface CardErrorProps {
  /** Error description shown to the user */
  message?: string;
  /** Retry callback — passed the error object so the parent can refetch */
  onRetry?: () => void;
  /** Optional additional class name */
  className?: string;
}

export function CardError({
  message = '数据加载失败，请稍后重试。',
  onRetry,
  className = '',
}: CardErrorProps) {
  return (
    <div
      role="alert"
      className={`mx-auto flex max-w-md flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50/80 px-6 py-10 text-center shadow-sm backdrop-blur-sm ${className}`}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
        <AlertTriangle size={28} className="text-red-500" />
      </div>
      <p className="text-sm font-medium text-red-700">{message}</p>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm transition-colors hover:bg-red-50 active:bg-red-100"
        >
          <RefreshCw size={14} />
          重试
        </button>
      ) : null}
    </div>
  );
}
