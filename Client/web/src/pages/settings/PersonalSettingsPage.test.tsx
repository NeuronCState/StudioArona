import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { PersonalSettingsPage } from "./PersonalSettingsPage";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/hooks/useTheme";

describe("PersonalSettingsPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: {
        id: "user-1",
        username: "teacher",
        display_name: "Teacher",
        role: "admin",
        created_at: new Date().toISOString(),
        preferences: {},
        face_enrolled: false,
      },
      isAuthenticated: true,
    });
    useThemeStore.setState({ theme: "system" });
  });

  it("renders profile data and updates appearance preferences", async () => {
    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <PersonalSettingsPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Teacher" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("teacher")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "外观" }));
    expect(
      await screen.findByRole("heading", { name: "外观" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "深色" }));
    expect(useThemeStore.getState().theme).toBe("dark");
  });
});
