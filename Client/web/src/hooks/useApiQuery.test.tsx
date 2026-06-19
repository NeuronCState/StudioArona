import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "@/mocks/node";
import { useConnectionStore } from "@/stores/connection";
import { useApiQuery } from "./useApiQuery";

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("useApiQuery", () => {
  it("reports offline explicitly and fetches after reconnecting", async () => {
    const request = vi.fn();
    server.use(
      http.get("/api/query-test", () => {
        request();
        return HttpResponse.json([{ id: "remote" }]);
      }),
    );
    useConnectionStore.setState({ serverStatus: "offline", userMode: "auto" });

    const { result } = renderHook(
      () =>
        useApiQuery({
          queryKey: ["query-test"],
          path: "/query-test",
          defaultData: [{ id: "local" }],
        }),
      { wrapper: createWrapper() },
    );

    expect(result.current.isOffline).toBe(true);
    expect(result.current.isPending).toBe(false);
    expect(result.current.data).toEqual([{ id: "local" }]);
    expect(request).not.toHaveBeenCalled();

    act(() => useConnectionStore.setState({ serverStatus: "online" }));

    await waitFor(() =>
      expect(result.current.data).toEqual([{ id: "remote" }]),
    );
    expect(result.current.isOffline).toBe(false);
    expect(request).toHaveBeenCalledOnce();
  });
});
