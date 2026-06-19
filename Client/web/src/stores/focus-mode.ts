import { create } from "zustand";

import { persist } from "zustand/middleware";

/**
 * Focus mode UI state — 三个核心开关
 *
 * - focusMode: AgentPanel 是否打开 (中心圆环 / 矩形扩散的目标态)
 * - focusSidebarOpen: FocusSidebar (历史 + 3 区域) 是否拉出
 *
 * 显式不持久化 focusMode — 刷新后回到 dashboard。
 */
interface FocusModeState {
  focusMode: boolean;
  focusSidebarOpen: boolean;
  setFocusMode: (on: boolean) => void;
  setFocusSidebarOpen: (open: boolean) => void;
  toggleFocusSidebar: () => void;
}

export const useFocusModeStore = create<FocusModeState>()(
  persist(
    (set, get) => ({
      focusMode: false,
      focusSidebarOpen: true,
      setFocusMode: (on) => set({ focusMode: on }),
      setFocusSidebarOpen: (open) => set({ focusSidebarOpen: open }),
      toggleFocusSidebar: () =>
        set({ focusSidebarOpen: !get().focusSidebarOpen }),
    }),
    {
      name: "studio-arona-focus-mode",
      partialize: (state) => ({ focusSidebarOpen: state.focusSidebarOpen }),
    },
  ),
);
