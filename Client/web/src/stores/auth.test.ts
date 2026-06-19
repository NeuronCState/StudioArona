import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "./auth";
import type { UserProfile } from "@/types/contracts";

const mockUser: UserProfile = {
  id: "u_1",
  username: "testuser",
  display_name: "Test User",
  role: "member",
  created_at: "2026-01-01T00:00:00Z",
  preferences: {},
  face_enrolled: false,
};

const mockAdmin: UserProfile = {
  id: "u_2",
  username: "admin",
  display_name: "Admin",
  role: "admin",
  created_at: "2026-01-01T00:00:00Z",
  preferences: { theme: "dark" },
  face_enrolled: true,
};

describe("useAuthStore", () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
    });
  });

  it("login() sets isAuthenticated, tokens, and user", () => {
    const { login } = useAuthStore.getState();
    login("access-token-123", "refresh-token-456", mockUser);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.accessToken).toBe("access-token-123");
    expect(state.refreshToken).toBe("refresh-token-456");
    expect(state.user).toEqual(mockUser);
  });

  it("logout() clears everything", () => {
    // First log in
    const { login } = useAuthStore.getState();
    login("token", "refresh", mockUser);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    // Then log out
    const { logout } = useAuthStore.getState();
    logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
  });

  it("setUser() updates user only, preserves tokens and auth state", () => {
    // First log in
    const { login } = useAuthStore.getState();
    login("token", "refresh", mockUser);

    // Update user
    const { setUser } = useAuthStore.getState();
    setUser(mockAdmin);

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockAdmin);
    expect(state.accessToken).toBe("token");
    expect(state.refreshToken).toBe("refresh");
    expect(state.isAuthenticated).toBe(true);
  });

  it("setUser() works when not authenticated", () => {
    const { setUser } = useAuthStore.getState();
    setUser(mockUser);

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(false);
    expect(state.accessToken).toBeNull();
  });
});
