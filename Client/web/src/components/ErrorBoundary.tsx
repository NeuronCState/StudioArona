import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Fallback name for debugging (e.g. "StudioHomePage"). */
  scope?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * App-wide error boundary. Catches render-time errors from any descendant
 * (including unhandled useQuery throws that escape queryFn) and shows a
 * "出错了" card instead of the default browser "Internal Server Error" /
 * blank page. Replaces the missing v3 error boundary.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Best-effort logging; routes through console so dev tools see it.
    console.error(
      `[ErrorBoundary${this.props.scope ? `:${this.props.scope}` : ""}]`,
      error,
      info,
    );
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const message = error.message || "未知错误";
    const isOffline = /offline|fetch|network|server|ECONNREFUSED|aborted/i.test(
      message,
    );

    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
          <AlertTriangle
            size={32}
            className="text-amber-600 dark:text-amber-400"
          />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-medium text-stone-800 dark:text-stone-200">
            {isOffline ? "无法连接到 server" : "页面出错了"}
          </p>
          <p className="max-w-md text-sm text-stone-500 dark:text-stone-400">
            {isOffline
              ? "server 没启动, 或网络不通。本地数据仍可访问, 但同步功能暂停。"
              : message}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
          >
            <RefreshCw size={14} />
            重试
          </button>
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 rounded-lg bg-stone-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-100"
          >
            刷新页面
          </button>
        </div>
        {this.props.scope ? (
          <p className="mt-2 text-xs text-stone-400 dark:text-stone-500">
            scope: <code>{this.props.scope}</code>
          </p>
        ) : null}
      </div>
    );
  }
}
