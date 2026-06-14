import { useEffect } from 'react';
import { eventBus } from '@/lib/event-bus';
import { useSessionStore } from '@/stores/session';
import type { WSEvent } from '@/types/ws-events';

export function useWakeEvents() {
  const setWakeState = useSessionStore((s) => s.setWakeState);

  useEffect(() => {
    const unsubscribe = eventBus.subscribe((event: WSEvent) => {
      switch (event.type) {
        case 'wake':
          setWakeState('waking');
          // Auto-transition to active after animation
          setTimeout(() => setWakeState('active'), 1200);
          break;
        case 'leave':
          setWakeState('leaving');
          // Auto-transition back to idle after countdown
          setTimeout(() => setWakeState('idle'), 5000);
          break;
      }
    });

    eventBus.connect();
    return () => {
      unsubscribe();
    };
  }, [setWakeState]);
}
