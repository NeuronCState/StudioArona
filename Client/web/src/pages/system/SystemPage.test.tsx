import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SystemPage } from "./SystemPage";
import { useAuthStore } from "@/stores/auth";
import { useSessionStore } from "@/stores/session";
import { useConnectionStore } from "@/stores/connection";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SystemPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "test-token",
      user: {
        id: "u_zhang",
        username: "zhang",
        display_name: "张旭宁",
        role: "admin",
        preferences: {},
        face_enrolled: true,
        created_at: "2026-01-15T08:00:00Z",
      },
      isAuthenticated: true,
    });
    useSessionStore.setState({ wakeState: "idle", currentSessionId: null });
    useConnectionStore.setState({ serverStatus: "online", userMode: "auto" });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("renders system metrics", async () => {
    renderWithProviders(<SystemPage />);

    await waitFor(() => {
      expect(screen.getByText("硬件监控")).toBeVisible();
    });
    expect(screen.getByText("CPU")).toBeVisible();
    expect(screen.getAllByText("内存").length).toBeGreaterThan(0);
  });

  it("shows GPU card", async () => {
    renderWithProviders(<SystemPage />);

    await waitFor(() => {
      expect(screen.getByText("NVIDIA V100 16GB")).toBeVisible();
    });
  });

  it("shows training jobs", async () => {
    renderWithProviders(<SystemPage />);

    await waitFor(() => {
      expect(screen.getByText("LLM Fine-tune v2")).toBeVisible();
      expect(screen.getByText("YOLOv8 Detection")).toBeVisible();
    });
  });

  it("shows network devices", async () => {
    renderWithProviders(<SystemPage />);

    await waitFor(() => {
      expect(screen.getByText("ubuntu-main")).toBeVisible();
    });
  });
});
