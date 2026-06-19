import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/stores/connection";
import * as storage from "./index";
import {
  useLocalResource,
  type LocalResourceDocument,
} from "./useLocalResource";

interface TestDocument extends LocalResourceDocument {
  title: string;
}

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("useLocalResource", () => {
  beforeEach(async () => {
    await storage.clear("schedules");
    useConnectionStore.setState({ serverStatus: "online", userMode: "auto" });
  });

  it("keeps a failed online write dirty for retry", async () => {
    const serverPush = vi.fn().mockRejectedValue(new Error("network down"));
    const onPushError = vi.fn();
    const { result } = renderHook(
      () =>
        useLocalResource<TestDocument>({
          table: "schedules",
          queryKey: ["test-schedules"],
          serverList: () => new Promise<TestDocument[]>(() => {}),
          serverPush,
          onPushError,
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.save({ id: "local-1", title: "local draft" });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(serverPush).toHaveBeenCalledOnce();
    expect(onPushError).toHaveBeenCalledOnce();
    expect(
      await storage.get<TestDocument>("schedules", "local-1"),
    ).toMatchObject({
      title: "local draft",
      dirty: true,
    });
  });

  it("pushes pending documents after reconnecting", async () => {
    useConnectionStore.setState({ serverStatus: "offline", userMode: "auto" });
    await storage.put("schedules", {
      id: "local-1",
      title: "offline draft",
      dirty: true,
    });
    let remote: TestDocument[] = [];
    const serverPush = vi.fn(async (doc: TestDocument) => {
      const synced = { ...doc, id: "s-1", serverId: "s-1", dirty: false };
      remote = [synced];
      return synced;
    });

    const { result } = renderHook(
      () =>
        useLocalResource<TestDocument>({
          table: "schedules",
          queryKey: ["reconnect-schedules"],
          serverList: async () => remote,
          serverPush,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.isOffline).toBe(true);

    act(() => useConnectionStore.setState({ serverStatus: "online" }));

    await waitFor(() => expect(serverPush).toHaveBeenCalledOnce());
    await waitFor(async () =>
      expect(await storage.get("schedules", "local-1")).toBeUndefined(),
    );
    expect(await storage.get<TestDocument>("schedules", "s-1")).toMatchObject({
      dirty: false,
      serverId: "s-1",
    });
    expect(result.current.isOffline).toBe(false);
  });

  it("preserves dirty local data while merging remote changes", async () => {
    await storage.put("schedules", {
      id: "s-1",
      serverId: "s-1",
      title: "local edit",
      dirty: true,
    });
    const serverList = vi.fn(async () => [
      { id: "s-1", title: "stale server value" },
      { id: "s-2", title: "new remote value" },
    ]);

    const { result } = renderHook(
      () =>
        useLocalResource<TestDocument>({
          table: "schedules",
          queryKey: ["merge-schedules"],
          serverList,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(await storage.get<TestDocument>("schedules", "s-1")).toMatchObject({
      title: "local edit",
      dirty: true,
    });
    expect(await storage.get<TestDocument>("schedules", "s-2")).toMatchObject({
      title: "new remote value",
      dirty: false,
    });
  });

  it("does not refetch when callers recreate the config object", async () => {
    const serverList = vi.fn(async () => []);
    const { rerender } = renderHook(
      () =>
        useLocalResource<TestDocument>({
          table: "schedules",
          queryKey: ["stable-schedules"],
          serverList: () => serverList(),
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(serverList).toHaveBeenCalledOnce());
    rerender();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(serverList).toHaveBeenCalledOnce();
  });

  it("keeps a failed delete as a hidden tombstone", async () => {
    await storage.put("schedules", {
      id: "s-1",
      title: "delete me",
      dirty: false,
    });
    const serverRemove = vi.fn().mockRejectedValue(new Error("network down"));
    const { result } = renderHook(
      () =>
        useLocalResource<TestDocument>({
          table: "schedules",
          queryKey: ["delete-schedules"],
          serverList: async () => [{ id: "s-1", title: "delete me" }],
          serverRemove,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    await act(async () => result.current.remove("s-1"));

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(await storage.get<TestDocument>("schedules", "s-1")).toMatchObject({
      dirty: true,
      serverId: "s-1",
    });
    expect(
      (await storage.get<TestDocument>("schedules", "s-1"))?.deletedAt,
    ).toEqual(expect.any(Number));
  });
});
