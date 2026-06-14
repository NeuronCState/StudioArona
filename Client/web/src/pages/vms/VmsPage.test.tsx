import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VmsPage } from './VmsPage';
import { useAuthStore } from '@/stores/auth';
import { useSessionStore } from '@/stores/session';

// xterm requires DOM APIs (ResizeObserver, canvas measurement) not fully
// supported in jsdom. Stub Terminal and FitAddon so VmDetail renders
// without crashing when it mounts the embedded terminal.
vi.mock('xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    loadAddon: vi.fn(),
    onData: vi.fn(),
    write: vi.fn(),
    writeln: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
  })),
}));

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

describe('VmsPage', () => {
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

  it('renders VM list', async () => {
    renderWithProviders(<VmsPage />);

    await waitFor(() => {
      expect(screen.getByText('li-dev')).toBeVisible();
    });
    expect(screen.getByText('wang-cuda')).toBeVisible();
  });

  it('shows create form', async () => {
    const user = userEvent.setup();
    renderWithProviders(<VmsPage />);

    await waitFor(() => {
      expect(screen.getByText('li-dev')).toBeVisible();
    });

    await user.click(screen.getByText('申请 VM'));

    expect(screen.getByText('申请虚拟机')).toBeVisible();
  });

  it('creates a new VM', async () => {
    const user = userEvent.setup();
    renderWithProviders(<VmsPage />);

    await waitFor(() => {
      expect(screen.getByText('li-dev')).toBeVisible();
    });

    await user.click(screen.getByText('申请 VM'));

    const nameInput = screen.getByPlaceholderText('my-vm');
    await user.type(nameInput, 'test-vm');

    await user.click(screen.getByText('提交'));

    await waitFor(() => {
      expect(screen.getByText('test-vm')).toBeVisible();
    });
  });

  it('click VM card opens detail', async () => {
    const user = userEvent.setup();
    renderWithProviders(<VmsPage />);

    await waitFor(() => {
      expect(screen.getByText('li-dev')).toBeVisible();
    });

    await user.click(screen.getByText('li-dev'));

    await waitFor(() => {
      expect(screen.getByText(/SSH: localhost:2222/)).toBeVisible();
    });
  });
});
