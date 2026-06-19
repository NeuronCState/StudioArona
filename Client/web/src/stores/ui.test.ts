import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useUIStore } from "./ui";

describe("useUIStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUIStore.setState({ toasts: [] });
    // Mock crypto.randomUUID for deterministic tests
    let counter = 0;
    vi.spyOn(crypto, "randomUUID").mockImplementation(
      () => `00000000-0000-0000-0000-${String(++counter).padStart(12, "0")}`,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("addToast", () => {
    it("adds a toast with message and level", () => {
      const { addToast } = useUIStore.getState();
      addToast("Test message", "info");

      const { toasts } = useUIStore.getState();
      expect(toasts).toHaveLength(1);
      expect(toasts[0]).toEqual({
        id: "00000000-0000-0000-0000-000000000001",
        message: "Test message",
        level: "info",
      });
    });

    it("adds multiple toasts", () => {
      const { addToast } = useUIStore.getState();
      addToast("First", "info");
      addToast("Second", "error");

      const { toasts } = useUIStore.getState();
      expect(toasts).toHaveLength(2);
      expect(toasts[0].message).toBe("First");
      expect(toasts[1].message).toBe("Second");
    });
  });

  describe("removeToast", () => {
    it("removes a toast by id", () => {
      const { addToast } = useUIStore.getState();
      addToast("Toast A", "info");
      addToast("Toast B", "warn");

      const { toasts } = useUIStore.getState();
      expect(toasts).toHaveLength(2);

      const { removeToast } = useUIStore.getState();
      removeToast(toasts[0].id);

      const remaining = useUIStore.getState().toasts;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].message).toBe("Toast B");
    });

    it("does nothing when removing a non-existent id", () => {
      const { addToast } = useUIStore.getState();
      addToast("Toast", "info");

      const { removeToast } = useUIStore.getState();
      removeToast("non-existent-id");

      expect(useUIStore.getState().toasts).toHaveLength(1);
    });
  });

  describe("toast auto-expiry", () => {
    it("removes toast after 4 seconds", () => {
      const { addToast } = useUIStore.getState();
      addToast("Expiring toast", "warn");

      expect(useUIStore.getState().toasts).toHaveLength(1);

      // Advance time by 3 seconds — toast should still be present
      vi.advanceTimersByTime(3000);
      expect(useUIStore.getState().toasts).toHaveLength(1);

      // Advance to 4 seconds — toast should be removed
      vi.advanceTimersByTime(1000);
      expect(useUIStore.getState().toasts).toHaveLength(0);
    });

    it("each toast expires independently", () => {
      const { addToast } = useUIStore.getState();
      addToast("First toast", "info");

      // Advance 2 seconds, then add another
      vi.advanceTimersByTime(2000);
      addToast("Second toast", "error");

      expect(useUIStore.getState().toasts).toHaveLength(2);

      // Advance 2 more seconds (4 total for first toast)
      vi.advanceTimersByTime(2000);
      expect(useUIStore.getState().toasts).toHaveLength(1);
      expect(useUIStore.getState().toasts[0].message).toBe("Second toast");

      // Advance 2 more seconds (4 total for second toast)
      vi.advanceTimersByTime(2000);
      expect(useUIStore.getState().toasts).toHaveLength(0);
    });
  });
});
