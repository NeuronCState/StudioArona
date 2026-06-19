// Synced with packages/contracts/ws-events.schema.json

export type WSEvent =
  | { type: "wake"; user_id: string; confidence?: number }
  | { type: "face_track"; x: number; y: number; size?: number }
  | { type: "leave"; duration_ms?: number }
  | { type: "rotate_screen"; orientation: "portrait" | "landscape" }
  | { type: "tracking"; enabled: boolean }
  | { type: "metrics_update"; payload: Record<string, unknown> }
  | { type: "screen_changed"; orientation: "portrait" | "landscape" };
