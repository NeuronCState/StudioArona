import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { useSessionStore } from '@/stores/session';
import { ChatPage } from './ChatPage';
import { WakeOverlay } from '@/components/wake/WakeOverlay';
import { LeaveCountdown } from '@/components/wake/LeaveCountdown';
import type { UserProfile } from '@/types/contracts';

// Mock createSSEConnection to avoid AbortSignal incompatibility between
// jsdom and MSW's @mswjs/interceptors. The real SSE client creates an
// AbortController whose signal is a jsdom AbortSignal (not a native one),
// which causes @mswjs/interceptors to throw "Expected signal to be an
// instance of AbortSignal".
vi.mock('@/lib/sse-client', () => ({
  createSSEConnection: (
    sessionId: string,
    _content: string,
    onEvent: (e: { event: string; data: unknown }) => void,
  ) => {
    const controller = new AbortController();

    const reply = '你好！我是 Arona，工作室智能助手。系统运行正常，今天有 3 个日程安排。';

    queueMicrotask(() => {
      onEvent({ event: 'session_started', data: { session_id: sessionId } });
      onEvent({ event: 'tool_call', data: { id: 't1', skill: 'system.status', args: {} } });
      onEvent({ event: 'tool_result', data: { id: 't1', ok: true, summary: '系统正常运行中' } });

      for (let i = 0; i < reply.length; i++) {
        onEvent({ event: 'token', data: { delta: reply[i], index: i } });
      }

      onEvent({ event: 'done', data: { message_id: 'm_test', tokens: reply.length } });
    });

    return controller;
  },
}));

// Mock framer-motion so motion.* render as plain DOM elements in jsdom.
// Without this, AnimatePresence exits with display:none and motion.div
// stays at initial opacity:0, making components invisible to testing-library.
vi.mock('framer-motion', async () => {
  const React = await import('react');

  const motionPropKeys = new Set([
    'initial', 'animate', 'exit', 'transition', 'variants',
    'whileHover', 'whileTap', 'whileInView', 'whileFocus',
    'whileDrag', 'layout', 'layoutId', 'layoutDependency',
    'onAnimationComplete', 'onAnimationStart', 'onUpdate',
    'drag', 'dragConstraints', 'dragElastic', 'dragMomentum',
    'dragPropagation', 'dragTransition',
  ]);

  function withoutMotionProps(props: Record<string, unknown>) {
    const clean: Record<string, unknown> = {};
    for (const key of Object.keys(props)) {
      if (!motionPropKeys.has(key)) clean[key] = props[key];
    }
    return clean;
  }

  const motionProxy = new Proxy(
    {},
    {
      get(_target, prop) {
        const tag = typeof prop === 'string' ? prop : 'div';
        return (props: Record<string, unknown>) =>
          React.createElement(tag, withoutMotionProps(props));
      },
    },
  );

  return {
    motion: motionProxy,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

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

describe('ChatPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'test-token',
      refreshToken: null,
      user: testUser,
      isAuthenticated: true,
    });
    useSessionStore.setState({
      wakeState: 'idle',
      currentSessionId: null,
      sidebarCollapsed: false,
    });
  });

  // Test 1: Verify dashboard cards render when not in chat mode.
  // isChatMode === false requires user to be null (so the
  // "(user && wakeState === 'idle')" shortcut does not fire).
  it('renders dashboard cards when idle', () => {
    useAuthStore.setState({ user: null });

    renderWithProviders(<ChatPage />);

    expect(screen.getByText('今日概览')).toBeVisible();
    expect(screen.getByTestId('fake-wake-btn')).toBeVisible();
  });

  // Test 2: Clicking "假装唤醒" triggers wakeState: 'waking' (WakeOverlay
  // shows "正在唤醒..."), then after 1200ms wakeState becomes 'active' and
  // ChatPage switches to chat mode.
  it('fake wake transitions to chat mode', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useAuthStore.setState({ user: null });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderWithProviders(
      <>
        <ChatPage />
        <WakeOverlay />
      </>,
    );

    // Click "假装唤醒"
    const wakeBtn = screen.getByTestId('fake-wake-btn');
    await user.click(wakeBtn);

    // Verify "正在唤醒..." overlay appears
    expect(screen.getByText('正在唤醒...')).toBeVisible();

    // Advance past the 1200ms setTimeout in DashboardCards.handleFakeWake
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Chat mode — chat input should now be visible
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/输入消息/)).toBeVisible();
    });

    vi.useRealTimers();
  });

  // Test 3: Typing a message and clicking send dispatches to the mocked SSE
  // stream (see module-level vi.mock('@/lib/sse-client') above). User message
  // appears immediately; streaming text appears after mock delivers tokens via
  // queueMicrotask.
  it('send message shows streaming response', async () => {
    useSessionStore.setState({
      wakeState: 'active',
      currentSessionId: 'test-session-123',
    });

    const user = userEvent.setup();
    renderWithProviders(<ChatPage />);

    // Type and send
    const input = screen.getByPlaceholderText(/输入消息/);
    await user.type(input, '你好');
    await user.click(screen.getByLabelText('发送消息'));

    // User message bubble should appear immediately
    expect(screen.getByText('你好')).toBeVisible();

    // Wait for the streaming response to include "我是 Arona"
    await waitFor(() => {
      expect(screen.getByText(/我是 Arona/)).toBeVisible();
    });
  });

  // Test 4: In chat mode, clicking "假装离开" sets wakeState to 'leaving',
  // which renders LeaveCountdown. Clicking "我还在，保留" returns to chat.
  it('fake leave shows countdown and keep returns to chat', async () => {
    useSessionStore.setState({
      wakeState: 'active',
      currentSessionId: 'test-session-123',
    });

    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ChatPage />
        <LeaveCountdown />
      </>,
    );

    // Trigger leave via session store (simulating hardware event)
    act(() => {
      useSessionStore.getState().setWakeState('leaving');
    });

    // Countdown overlay should appear
    await waitFor(() => {
      expect(screen.getByText('无人，即将清空对话')).toBeVisible();
    });

    // Click "我还在，保留"
    await user.click(screen.getByText('我还在，保留'));

    // Should return to chat mode
    await waitFor(() => {
      expect(useSessionStore.getState().wakeState).toBe('active');
    });
  });
});
