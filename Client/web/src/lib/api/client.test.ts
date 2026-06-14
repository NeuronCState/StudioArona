import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { api, ApiError } from './client';
import { useAuthStore } from '@/stores/auth';

// Helper to reset auth store between tests
function resetAuthStore() {
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
  });
}

describe('ApiClient', () => {
  beforeEach(() => {
    resetAuthStore();
  });

  it('successful GET returns data', async () => {
    server.use(
      http.get('/api/test', () => {
        return HttpResponse.json({ message: 'ok' });
      }),
    );

    const data = await api.get<{ message: string }>('/test');
    expect(data).toEqual({ message: 'ok' });
  });

  it('sets Authorization header when token exists', async () => {
    let capturedHeaders: Headers | undefined;
    server.use(
      http.get('/api/test', ({ request }) => {
        capturedHeaders = request.headers;
        return HttpResponse.json({ ok: true });
      }),
    );

    useAuthStore.setState({ accessToken: 'my-token' });
    await api.get('/test');

    expect(capturedHeaders!.get('Authorization')).toBe('Bearer my-token');
  });

  it('does not set Authorization header when no token', async () => {
    let capturedHeaders: Headers | undefined;
    server.use(
      http.get('/api/test', ({ request }) => {
        capturedHeaders = request.headers;
        return HttpResponse.json({ ok: true });
      }),
    );

    resetAuthStore();
    await api.get('/test');

    expect(capturedHeaders!.get('Authorization')).toBeNull();
  });

  it('401 response triggers logout and throws ApiError', async () => {
    server.use(
      http.get('/api/test', () => {
        return HttpResponse.json({ code: 'UNAUTHORIZED', message: 'Session expired' }, { status: 401 });
      }),
    );

    // Set up authenticated state so we can verify logout clears it
    useAuthStore.setState({
      accessToken: 'expired-token',
      refreshToken: 'refresh',
      user: { id: 'u1', username: 'test', display_name: 'Test', role: 'member', created_at: '', preferences: {}, face_enrolled: false },
      isAuthenticated: true,
    });

    await expect(api.get('/test')).rejects.toThrow(ApiError);
    await expect(api.get('/test')).rejects.toThrow('Session expired');

    // Verify logout was called
    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('non-200 response throws ApiError with server message', async () => {
    server.use(
      http.get('/api/test', () => {
        return HttpResponse.json({ code: 'NOT_FOUND', message: 'Resource not found' }, { status: 404 });
      }),
    );

    await expect(api.get('/test')).rejects.toThrow(ApiError);
    try {
      await api.get('/test');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe('NOT_FOUND');
      expect((err as ApiError).message).toBe('Resource not found');
    }
  });

  it('non-200 response with no JSON body throws with fallback message', async () => {
    server.use(
      http.get('/api/test', () => {
        return new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' });
      }),
    );

    try {
      await api.get('/test');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe('UNKNOWN');
      expect((err as ApiError).message).toBe('Internal Server Error');
    }
  });

  it('204 response returns undefined', async () => {
    server.use(
      http.delete('/api/test', () => {
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const result = await api.delete('/test');
    expect(result).toBeUndefined();
  });
});
