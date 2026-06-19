// Shared client contracts. `api.ts` is a schema snapshot from the previous API
// implementation; Rust-center additions stay explicit below until the server
// exposes a reproducible OpenAPI document.

import type { components } from "./api";

type Schemas = components["schemas"];

export type User = Schemas["User"];
// Rust-center fields that are absent from the legacy schema snapshot.
export type UserProfile = Schemas["UserProfile"] & {
  email?: string | null;
  notify_by_email?: boolean;
};
export type ChatSession = Schemas["ChatSession"];
export type ChatMessage = Schemas["ChatMessage"];
export type Feed = Schemas["Feed"];
export type Schedule = Schemas["Schedule"];
export type GpuProcess = Schemas["GpuProcess"];
export type GPU = Schemas["GPU"];
export type CPUCore = Schemas["CPUCore"];
export type DiskUsage = Schemas["DiskUsage"];
export type TrainingJob = Schemas["TrainingJob"];
export type SystemMetrics = Schemas["SystemMetrics"];
export type VM = Schemas["VM"];
export type NetworkDevice = Schemas["NetworkDevice"];
export type ApiError = Schemas["Error"];

// Rust-center contracts that are absent from the legacy schema snapshot.

export type NotificationLevel = "info" | "warn" | "error";

export interface AppNotification {
  id: string;
  title: string;
  body: string | null;
  level: NotificationLevel;
  read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: AppNotification[];
  unread_count: number;
}

export interface PageMonitor {
  id: string;
  url: string;
  label: string;
  css_selector: string;
  last_hash: string | null;
  last_checked_at: string | null;
  last_changed_at: string | null;
  check_interval_min: number;
  enabled: boolean;
  created_at: string;
}

export interface PageMonitorEvent {
  id: string;
  title: string;
  link: string;
  summary: string | null;
  published_at: string;
  created_at: string;
}
