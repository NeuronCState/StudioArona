import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { useAuthStore } from '@/stores/auth';
import { FeedsPage } from './FeedsPage';
import type { UserProfile } from '@/types/contracts';
import type { Feed } from '@/types/contracts';

const testUser: UserProfile = {
  id: 'u1',
  username: 'test',
  display_name: 'Test',
  role: 'member',
  preferences: {},
  face_enrolled: false,
  created_at: '2026-01-01T00:00:00Z',
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

describe('FeedsPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'test-token',
      refreshToken: null,
      user: testUser,
      isAuthenticated: true,
    });
  });

  // Test 1: Loads and displays feeds
  it('loads and displays feeds', async () => {
    renderWithProviders(<FeedsPage />);

    // Wait for feed titles from mock data (personal scope only)
    await waitFor(() => {
      expect(screen.getByText('Hacker News')).toBeVisible();
    });

    expect(screen.getByText('arXiv CS.AI')).toBeVisible();
    expect(screen.getByText('我的信息源')).toBeVisible();
  });

  // Test 2: Shows add RSS form
  it('shows add RSS form', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeedsPage />);

    // Wait for the page to load, then click "添加 RSS"
    await waitFor(() => {
      expect(screen.getByText('添加 RSS')).toBeVisible();
    });

    await user.click(screen.getByText('添加 RSS'));

    // Verify URL input appears
    expect(screen.getByPlaceholderText('RSS URL')).toBeVisible();

    // Verify hint text is visible
    expect(screen.getByText(/你也可以直接对阿洛娜说/)).toBeVisible();
  });

  // Test 3: Adds a new RSS feed
  it('adds a new RSS feed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeedsPage />);

    // Wait for load and open add form
    await waitFor(() => {
      expect(screen.getByText('添加 RSS')).toBeVisible();
    });
    await user.click(screen.getByText('添加 RSS'));

    // Fill in the URL
    const input = screen.getByPlaceholderText('RSS URL');
    await user.type(input, 'https://example.com/rss');

    // Click the form's submit "添加" button
    await user.click(screen.getByRole('button', { name: /^添加$/ }));

    // Verify the add form closes (URL input is gone)
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('RSS URL')).not.toBeInTheDocument();
    });
  });

  // Test 4: Empty state when no feeds
  it('shows empty state when no feeds', async () => {
    // Override the feeds handler to return an empty array
    server.use(
      http.get('/api/feeds', () => {
        return HttpResponse.json([] as Feed[]);
      }),
    );

    renderWithProviders(<FeedsPage />);

    // Verify empty state message is displayed
    await waitFor(() => {
      expect(screen.getByText('暂无 RSS 订阅')).toBeVisible();
    });

    // Secondary hint text should also be visible
    expect(screen.getByText(/添加 RSS 源来追踪/)).toBeVisible();
  });
});
