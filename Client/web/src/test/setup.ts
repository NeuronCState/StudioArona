import "@testing-library/jest-dom";
import "fake-indexeddb/auto";
import { server } from "@/mocks/node";
import { useConnectionStore } from "@/stores/connection";
import { useAuthStore } from "@/stores/auth";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  // 默认 connection 状态, 避免 api client 抛 OFFLINE
  useConnectionStore.setState({ serverStatus: "online", userMode: "auto" });
  // 清空 auth, 避免持久化状态污染
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
  });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
