import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DesignMode = 'arona' | 'studio';

interface DesignModeState {
  mode: DesignMode;
  setMode: (mode: DesignMode) => void;
  toggleMode: () => void;
}

export const useDesignModeStore = create<DesignModeState>()(
  persist(
    (set) => ({
      mode: 'studio',
      setMode: (mode) => set({ mode }),
      toggleMode: () => set((state) => ({ mode: state.mode === 'arona' ? 'studio' : 'arona' })),
    }),
    { name: 'studio-arona-design-mode' },
  ),
);
