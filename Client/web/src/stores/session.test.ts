import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from './session';

describe('useSessionStore', () => {
  beforeEach(() => {
    useSessionStore.setState({
      wakeState: 'idle',
      currentSessionId: null,
      sidebarCollapsed: false,
    });
  });

  describe('setWakeState', () => {
    it('changes wake state', () => {
      const { setWakeState } = useSessionStore.getState();

      setWakeState('waking');
      expect(useSessionStore.getState().wakeState).toBe('waking');

      setWakeState('active');
      expect(useSessionStore.getState().wakeState).toBe('active');

      setWakeState('leaving');
      expect(useSessionStore.getState().wakeState).toBe('leaving');

      setWakeState('idle');
      expect(useSessionStore.getState().wakeState).toBe('idle');
    });
  });

  describe('setCurrentSessionId', () => {
    it('changes session id', () => {
      const { setCurrentSessionId } = useSessionStore.getState();

      setCurrentSessionId('session-123');
      expect(useSessionStore.getState().currentSessionId).toBe('session-123');
    });

    it('sets session id to null', () => {
      const { setCurrentSessionId } = useSessionStore.getState();

      setCurrentSessionId('session-123');
      setCurrentSessionId(null);
      expect(useSessionStore.getState().currentSessionId).toBeNull();
    });
  });

  describe('toggleSidebar', () => {
    it('toggles sidebar collapsed state', () => {
      const { toggleSidebar } = useSessionStore.getState();

      // Initial state is false
      expect(useSessionStore.getState().sidebarCollapsed).toBe(false);

      toggleSidebar();
      expect(useSessionStore.getState().sidebarCollapsed).toBe(true);

      toggleSidebar();
      expect(useSessionStore.getState().sidebarCollapsed).toBe(false);
    });
  });
});
