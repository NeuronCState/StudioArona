import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SharedPage } from './SharedPage';
import { useAuthStore } from '@/stores/auth';
import { useSessionStore } from '@/stores/session';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SharedPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'test-token',
      user: {
        id: 'u_zhang',
        username: 'zhang',
        display_name: '张旭宁',
        role: 'admin',
        preferences: {},
        face_enrolled: true,
        created_at: '2026-01-15T08:00:00Z',
      },
      isAuthenticated: true,
    });
    useSessionStore.setState({ wakeState: 'idle', currentSessionId: null });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders shared page', async () => {
    renderWithProviders(<SharedPage />);

    // Title and announcement render synchronously
    expect(screen.getByText('共享信息源')).toBeVisible();
    expect(screen.getByText('工作室公告')).toBeVisible();

    // Section headers render synchronously
    expect(screen.getByText('共享日程')).toBeVisible();
    expect(screen.getByText('共享订阅')).toBeVisible();

    // Wait for async schedule data to populate
    await waitFor(() => {
      expect(screen.getByText('周一团队站会')).toBeVisible();
    });
  });

  it('shows permission legend', async () => {
    renderWithProviders(<SharedPage />);

    await waitFor(() => {
      expect(screen.getByText('共享信息源')).toBeVisible();
    });

    expect(screen.getByText('仅创建者可改')).toBeVisible();
    expect(screen.getByText('全员可改')).toBeVisible();
    expect(screen.getByText('公开可见')).toBeVisible();
  });

  it('shows shared feeds', async () => {
    renderWithProviders(<SharedPage />);

    await waitFor(() => {
      expect(screen.getByText('TechCrunch')).toBeVisible();
      expect(screen.getByText('The Verge')).toBeVisible();
    });
  });
});
