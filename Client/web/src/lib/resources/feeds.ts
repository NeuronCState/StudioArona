import { api } from "@/lib/api/client";
import type { LocalResourceConfig } from "@/lib/storage/useLocalResource";
import type { Feed } from "@/types/contracts";

export function feedResourceConfig(): LocalResourceConfig<Feed> {
  return {
    table: "feeds",
    queryKey: ["feeds", "local"],
    serverList: () => api.get<Feed[]>("/feeds"),
    serverPush: (doc) =>
      api.post<Feed>("/feeds", {
        url: doc.url,
        title: doc.title,
      }),
    serverRemove: (id) => api.delete(`/feeds/${id}`),
  };
}
