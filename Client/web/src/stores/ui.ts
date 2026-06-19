import { create } from "zustand";

export type ToastLevel = "info" | "warn" | "error";

export interface Toast {
  id: string;
  message: string;
  level: ToastLevel;
}

interface UIState {
  toasts: Toast[];
  addToast: (message: string, level: ToastLevel) => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  toasts: [],
  addToast: (message, level) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { id, message, level }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
