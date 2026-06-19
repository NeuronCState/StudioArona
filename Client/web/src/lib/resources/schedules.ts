import { api, ApiError } from "@/lib/api/client";
import { useConflictStore } from "@/lib/sync/ConflictStore";
import type {
  LocalResourceConfig,
  LocalResourceDocument,
} from "@/lib/storage/useLocalResource";

export interface ScheduleDocument extends LocalResourceDocument {
  title: string;
  body?: string;
  starts_at: string;
  location?: string;
  source: string;
  updated_at?: string;
  serverUpdatedAt?: string | null;
}

export function scheduleResourceConfig(
  view: "upcoming" | "all" = "upcoming",
): LocalResourceConfig<ScheduleDocument> {
  const suffix = view === "upcoming" ? "?upcoming=true" : "";
  return {
    table: "schedules",
    queryKey: ["schedules", view, "local"],
    serverList: () => api.get<ScheduleDocument[]>(`/schedules${suffix}`),
    serverPush: async (doc) => {
      const body = {
        title: doc.title,
        body: doc.body,
        starts_at: doc.starts_at,
        location: doc.location,
        expected_updated_at: doc.serverUpdatedAt ?? doc.updated_at,
      };
      const result = doc.serverId
        ? await api.patch<ScheduleDocument>(`/schedules/${doc.serverId}`, body)
        : await api.post<ScheduleDocument>("/schedules", body);
      return { ...result, serverUpdatedAt: result.updated_at ?? null };
    },
    serverRemove: (id) => api.delete(`/schedules/${id}`),
    onPushError: (doc, error) => {
      if (!(error instanceof ApiError) || error.status !== 409 || !error.body)
        return;
      const body = error.body as {
        server?: Record<string, unknown>;
        client?: Record<string, unknown>;
        field_diff?: string[];
      };
      if (!body.server) return;
      useConflictStore.getState().addConflict({
        table: "schedules",
        docId: doc.serverId ?? doc.id,
        serverDoc: body.server,
        clientDoc: body.client ?? (doc as unknown as Record<string, unknown>),
        fieldDiff: body.field_diff ?? [],
        detectedAt: Date.now(),
      });
    },
  };
}
