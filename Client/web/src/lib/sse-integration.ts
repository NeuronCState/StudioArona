import type { SSEEvent } from './sse-client';
import { dispatchUIAction } from './ui-actions';
import { useUIStore } from '@/stores/ui';

// ── Processing result — caller uses this to update chat UI state ──

export type SSEProcessEffect =
  | { type: 'token'; text: string }
  | { type: 'tool_call'; id: string; tool: string; args: unknown }
  | { type: 'tool_result'; id: string; status: 'ok' | 'error'; result?: unknown; error?: string }
  | { type: 'done' }
  | { type: 'none' };

/**
 * processSSEEvent — unified SSE event processor.
 *
 * Every SSE event from the backend flows through this function.
 * Side effects (toast, ui_action dispatch) are handled internally.
 * The returned effect tells the caller how to update the chat stream state.
 */
export function processSSEEvent(event: SSEEvent): SSEProcessEffect {
  switch (event.type) {
    case 'token':
      // token events accumulate to the assistant message text
      return { type: 'token', text: event.text };

    case 'tool_call':
      // A tool call started — caller should create a ToolCallBubble in 'loading' state
      return {
        type: 'tool_call',
        id: event.id,
        tool: event.tool,
        args: event.args,
      };

    case 'tool_result':
      // A tool call completed — caller should update the ToolCallBubble to success/error
      return {
        type: 'tool_result',
        id: event.id,
        status: event.status,
        result: event.result,
        error: event.error,
      };

    case 'ui_action':
      // UI actions are dispatched globally via the handler registry in ui-actions.ts
      dispatchUIAction(event.action);
      return { type: 'none' };

    case 'done':
      // Stream completed — caller should unset isStreaming
      return { type: 'done' };

    case 'error':
      // Server-side error — show as a toast, also let the caller append to the message
      useUIStore.getState().addToast(event.message, 'error');
      return { type: 'none' };

    default:
      return { type: 'none' };
  }
}
