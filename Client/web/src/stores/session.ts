import { create } from "zustand";

export type WakeState = "idle" | "waking" | "active" | "leaving";

export interface SessionSummary {
  id: string;
  title: string;
  created_at: string;
}

interface SessionState {
  wakeState: WakeState;
  currentSessionId: string | null;
  sidebarCollapsed: boolean;
  sessions: SessionSummary[];
  setWakeState: (state: WakeState) => void;
  setCurrentSessionId: (id: string | null) => void;
  toggleSidebar: () => void;
  setSessions: (sessions: SessionSummary[]) => void;
  addSession: (session: SessionSummary) => void;
  renameSession: (id: string, title: string) => void;
  removeSession: (id: string) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  wakeState: "idle",
  currentSessionId: null,
  sidebarCollapsed: false,
  sessions: [],
  setWakeState: (wakeState) => set({ wakeState }),
  setCurrentSessionId: (currentSessionId) => set({ currentSessionId }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),
  renameSession: (id, title) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, title } : sess,
      ),
    })),
  removeSession: (id) =>
    set((s) => ({ sessions: s.sessions.filter((sess) => sess.id !== id) })),
}));
