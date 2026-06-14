import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentMessageItem } from '../AgentMessage';
import { AgentErrorToast } from '../AgentErrorToast';
import type { AgentMessage as ChatMessage } from '../useAgentChat';

let originalFetch: typeof globalThis.fetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('AgentMessageItem — error rendering', () => {
  const baseMsg: ChatMessage = {
    id: 'a-1',
    role: 'assistant',
    content: 'partial content before the failure',
    createdAt: 0,
  };

  it('shows the normal assistant bubble for healthy messages', () => {
    render(
      <AgentMessageItem
        message={baseMsg}
        onRemoveAttachment={() => {}}
        agentName="阿洛娜"
      />,
    );
    expect(screen.getByText('partial content before the failure')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-message-error')).toBeNull();
  });

  it('renders an error banner with the message text and a retry button when error is set', () => {
    const onRetry = vi.fn();
    render(
      <AgentMessageItem
        message={{ ...baseMsg, error: '连不上 Hermes (http://x)' }}
        onRemoveAttachment={() => {}}
        agentName="阿洛娜"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByTestId('agent-message-error')).toBeInTheDocument();
    expect(screen.getByText('连不上 Hermes (http://x)')).toBeInTheDocument();
    // The partial content text is still surfaced under the error header.
    expect(screen.getByText('partial content before the failure')).toBeInTheDocument();
    expect(screen.getByText('生成失败')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: '重试' });
    retry.click();
    expect(onRetry).toHaveBeenCalledWith('a-1');
  });

  it('does not render the retry button when onRetry is omitted', () => {
    render(
      <AgentMessageItem
        message={{ ...baseMsg, error: 'boom' }}
        onRemoveAttachment={() => {}}
        agentName="阿洛娜"
      />,
    );
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
  });
});

describe('AgentErrorToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when message is null', () => {
    const { container } = render(
      <AgentErrorToast message={null} onDismiss={() => {}} />,
    );
    expect(container.querySelector('[data-testid="agent-error-toast"]')).toBeNull();
  });

  it('shows the message and calls onDismiss when the close button is clicked', () => {
    const onDismiss = vi.fn();
    render(<AgentErrorToast message="boom" onDismiss={onDismiss} />);
    // framer-motion's AnimatePresence keeps the exit node around for the
    // exit transition. jsdom doesn't run the transition, so both the
    // present and exiting elements can share the testid; assert that at
    // least one is present and that it carries the right text.
    const toasts = screen.queryAllByTestId('agent-error-toast');
    expect(toasts.length).toBeGreaterThan(0);
    const messages = screen.queryAllByTestId('agent-error-toast-message');
    expect(messages[0].textContent).toBe('boom');
    screen.getAllByRole('button', { name: '关闭错误提示' })[0].click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('auto-dismisses after the configured duration', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<AgentErrorToast message="boom" onDismiss={onDismiss} durationMs={500} />);
    expect(onDismiss).not.toHaveBeenCalled();
    // Advance the synthetic clock past the dismiss deadline. The hook's
    // setTimeout fires once, calling onDismiss synchronously from the
    // timer callback.
    vi.advanceTimersByTime(500);
    expect(onDismiss).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
