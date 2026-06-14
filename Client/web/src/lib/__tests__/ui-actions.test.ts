import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dispatchUIAction, setNavigateFn, setRenderCardHandler } from '../ui-actions';

describe('ui-actions dispatcher', () => {
  beforeEach(() => {
    setNavigateFn(null!);
  });

  it('dispatches navigate action', () => {
    const nav = vi.fn();
    setNavigateFn(nav);
    dispatchUIAction({ type: 'navigate', to: '/system' });
    expect(nav).toHaveBeenCalledWith('/system');
  });

  it('dispatches toast action', () => {
    dispatchUIAction({ type: 'toast', message: 'test toast', level: 'info' });
    // toast is dispatched to UIStore — just verify it doesn't throw
  });

  it('dispatches render_card to registered handler', () => {
    const handler = vi.fn();
    setRenderCardHandler(handler);
    dispatchUIAction({
      type: 'render_card',
      payload: { componentName: 'WeatherCard', props: { city: 'Beijing', temp: 25 } },
    });
    expect(handler).toHaveBeenCalledWith('WeatherCard', { city: 'Beijing', temp: 25 });
  });

  it('dispatches clear_session as custom event', () => {
    const listener = vi.fn();
    window.addEventListener('javis:clear-session', listener);
    dispatchUIAction({ type: 'clear_session' });
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener('javis:clear-session', listener);
  });

  it('handles confirm action', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const nav = vi.fn();
    setNavigateFn(nav);
    dispatchUIAction({ type: 'confirm', message: 'Sure?', action: '/chat' });
    expect(confirmSpy).toHaveBeenCalledWith('Sure?');
    confirmSpy.mockRestore();
  });
});
