import { useAuthStore } from '@/stores/auth';
import { useConnectionStore } from '@/stores/connection';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match ? match[1] : null;
}

interface RefreshResponse {
  access_token: string;
  refresh_token?: string;
}

/**
 * 单例: 多个并发请求同时遇到 401 时, 只触发一次 refresh。
 * 其它请求等待这一次 refresh 完成后, 用新 token 重试。
 */
let refreshInflight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  // 已经在 refresh 中, 复用同一个 promise
  if (refreshInflight) return refreshInflight;

  const state = useAuthStore.getState();
  const rt = state.refreshToken;
  if (!rt) {
    state.logout();
    return null;
  }

  refreshInflight = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) {
        state.logout();
        return null;
      }
      const data: RefreshResponse = await res.json();
      const auth = useAuthStore.getState();
      auth.setAccessToken(data.access_token);
      // 后端可能轮换 refresh_token (rotation), 用新的
      if (data.refresh_token) {
        auth.login(data.access_token, data.refresh_token, auth.user!);
      }
      return data.access_token;
    } catch {
      useAuthStore.getState().logout();
      return null;
    } finally {
      // 释放 inflight 锁, 允许下次重新 refresh
      refreshInflight = null;
    }
  })();

  return refreshInflight;
}

class ApiClient {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    // 第一次请求
    const res = await this.rawFetch(path, options);

    if (res.status === 401) {
      // access token 过期, 尝试 refresh
      const newToken = await refreshAccessToken();
      if (!newToken) {
        // refresh 失败 (refresh 也过期或无效), logout
        throw new ApiError('UNAUTHORIZED', 'Session expired');
      }
      // 用新 token 重试一次原请求
      const retry = await this.rawFetch(path, options);
      if (retry.status === 401) {
        // 重试还 401, refresh token 真的不行
        useAuthStore.getState().logout();
        throw new ApiError('UNAUTHORIZED', 'Session expired');
      }
      return this.handleResponse<T>(retry);
    }

    return this.handleResponse<T>(res);
  }

  private async rawFetch(path: string, options: RequestInit): Promise<Response> {
    // 本地 fake token (admin / dev bypass): 不打 server, 抛 OFFLINE 走 useApiQuery silent fail
    // 避免 server 401 → refresh → 401 → 自动 logout 链 (用户没连 server 期望)
    const auth = useAuthStore.getState();
    if (auth.tokenMode === 'local') {
      throw new ApiError('OFFLINE', 'local token, no server access', 0);
    }

    // 当前不是 online (启动默认 offline / server 真不可达): 也不打 server
    // 让 prefetch 静默, 不触发 401 chain
    if (useConnectionStore.getState().effectiveMode() !== 'online') {
      throw new ApiError('OFFLINE', 'server not in online mode', 0);
    }

    const token = useAuthStore.getState().accessToken;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) ?? {}),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const csrf = getCsrfToken();
    if (csrf && options.method && options.method !== 'GET') {
      headers['X-CSRF-Token'] = csrf;
    }

    try {
      return await fetch(`${BASE_URL}${path}`, { ...options, headers });
    } catch (e) {
      // Network error: server not reachable. Mark offline + throw ApiError('OFFLINE').
      // 业务 page 会 catch (or useQuery 进 error state) 走本地数据; StudioServiceOffline 显示占位.
      useConnectionStore.getState().setServerStatus('offline');
      throw new ApiError('OFFLINE', e instanceof Error ? e.message : 'server unreachable', 0);
    }
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      // 5xx (server 错误 / Vite proxy 502) → 静默当 offline. 不把 HTML body 抛给上层 (避免 "Internal Server Error" 字符串).
      if (res.status >= 500) {
        useConnectionStore.getState().setServerStatus('offline');
        throw new ApiError('OFFLINE', 'server unavailable', res.status);
      }
      // 4xx: 业务错误 (401/403/404/409). 保留 body.
      const body = await res.json().catch(() => ({}));
      throw new ApiError(body.code ?? 'UNKNOWN', body.message ?? res.statusText, res.status, body);
    }
    // 200-299: server 在线, 标记
    useConnectionStore.getState().setServerStatus('online');
    if (res.status === 204) return undefined as T;
    return res.json();
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    /** HTTP status code (4xx / 5xx). 用于 useSync 识别 409 Conflict */
    public status?: number,
    /** 完整响应 body — useSync 拿 server / client / field_diff */
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = new ApiClient();
export { ApiError };
