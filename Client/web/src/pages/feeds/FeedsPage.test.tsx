import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/node";
import { useAuthStore } from "@/stores/auth";
import { useConnectionStore } from "@/stores/connection";
import { FeedsPage } from "./FeedsPage";
import type { UserProfile } from "@/types/contracts";
import type { Feed } from "@/types/contracts";

const testUser: UserProfile = {
  id: "u1",
  username: "test",
  display_name: "Test",
  role: "member",
  preferences: {},
  face_enrolled: false,
  created_at: "2026-01-01T00:00:00Z",
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

describe("FeedsPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "test-token",
      refreshToken: null,
      user: testUser,
      isAuthenticated: true,
    });
    // 关键: 默认 serverStatus='unknown' → effectiveMode='offline' → api 抛 OFFLINE → useApiQuery silent success → data=defaultData=[]
    // 测试要把 connection 强制为 online, 让 useApiQuery 真去 msw 拉数据
    useConnectionStore.setState({ serverStatus: "online", userMode: "auto" });
  });

  // Test 1: 加载并展示 feed 列表 (mock 返回 4 个 feeds)
  it("loads and displays feeds from the API", async () => {
    renderWithProviders(<FeedsPage />);

    await waitFor(() => {
      expect(screen.getByText("Hacker News")).toBeInTheDocument();
    });
    expect(screen.getByText("arXiv CS.AI")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/输入 RSS \/ 网页 URL/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /订阅/ })).toBeInTheDocument();
  });

  // Test 2: 输入 URL 后, UI 应识别为 RSS 类型
  it("detects RSS URLs and shows the RSS badge", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeedsPage />);

    const input = await screen.findByPlaceholderText(/输入 RSS \/ 网页 URL/);
    await user.type(input, "https://example.com/feed.xml");

    // "RSS 解析" 出现在徽章和帮助区 (固定显示), 用 getAllByText 验证至少存在
    await waitFor(() => {
      expect(screen.getAllByText("RSS 解析").length).toBeGreaterThanOrEqual(1);
    });
    // 进一步验证表单中出现了 emerald-50 的圆角徽章 (按 class 区分徽章)
    expect(document.querySelector(".bg-emerald-50")).toBeInTheDocument();
  });

  // Test 3: 添加一条新的 RSS feed 后, 列表出现新条目
  it("appends a newly added RSS feed to the list", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeedsPage />);

    await screen.findByText("Hacker News");

    const input = screen.getByPlaceholderText(/输入 RSS \/ 网页 URL/);
    await user.type(input, "https://example.com/feed.xml");
    await user.click(screen.getByRole("button", { name: /订阅/ }));

    // 新 URL hostname "example.com" 应当作为标题出现在列表里
    await waitFor(() => {
      expect(screen.getByText("example.com")).toBeInTheDocument();
    });
  });

  // Test 4: 空状态 — API 返回空数组
  it("shows the empty state when no feeds exist", async () => {
    server.use(
      http.get("/api/feeds", () => {
        return HttpResponse.json([] as Feed[]);
      }),
    );

    renderWithProviders(<FeedsPage />);

    await waitFor(() => {
      expect(screen.getByText("暂无订阅")).toBeInTheDocument();
    });
  });
});
