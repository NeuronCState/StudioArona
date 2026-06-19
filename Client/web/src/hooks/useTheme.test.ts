import { describe, it, expect, beforeEach, vi } from "vitest";
import { useThemeStore } from "./useTheme";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe("useThemeStore", () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: "system" });
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to system theme", () => {
    const { theme } = useThemeStore.getState();
    expect(theme).toBe("system");
  });

  it("setTheme dark sets data-theme attribute", () => {
    useThemeStore.getState().setTheme("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("setTheme light sets data-theme to light", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    useThemeStore.getState().setTheme("light");
    expect(useThemeStore.getState().theme).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("toggle cycles through themes", () => {
    useThemeStore.getState().toggle();
    let state = useThemeStore.getState();
    expect(state.theme).toBe("dark");

    state.toggle();
    state = useThemeStore.getState();
    expect(state.theme).toBe("light");

    state.toggle();
    state = useThemeStore.getState();
    expect(state.theme).toBe("system");
  });
});
