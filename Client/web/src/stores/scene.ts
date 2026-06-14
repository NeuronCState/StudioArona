/**
 * Scene state — managed via Zustand for cross-component access.
 * Components (ClassroomScene, AronaModel, AronaShell) can read/write
 * without prop drilling.
 */
import { create } from 'zustand';

export interface SceneState {
  /** Current scene time — drives Three.js DynamicSun + Spine ambiance */
  time: 'day' | 'night';

  /** Spine model loading state */
  modelState: 'idle' | 'loading' | 'ready' | 'error';
  modelError: string | null;

  /** Current emotion (drives Spine expression animation) */
  emotion: string;

  setTime: (t: 'day' | 'night') => void;
  toggleTime: () => void;
  setModelState: (s: SceneState['modelState']) => void;
  setModelError: (e: string | null) => void;
  setEmotion: (e: string) => void;
}

export const useSceneStore = create<SceneState>((set) => ({
  time: 'day',
  modelState: 'idle',
  modelError: null,
  emotion: 'neutral',

  setTime: (t) => set({ time: t }),
  toggleTime: () => set((s) => ({ time: s.time === 'day' ? 'night' : 'day' })),
  setModelState: (modelState) => set({ modelState }),
  setModelError: (modelError) => set({ modelError }),
  setEmotion: (emotion) => set({ emotion }),
}));
