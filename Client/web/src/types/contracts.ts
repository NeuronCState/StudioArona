// Source of truth: packages/contracts/openapi.yaml
// Re-exports from auto-generated TS types: packages/contracts/ts/api.d.ts
// Run `make generate-types-ts` to refresh after OpenAPI changes.

import type { components } from './api';

type Schemas = components['schemas'];

export type User = Schemas['User'];
export type UserProfile = Schemas['UserProfile'];
export type ChatSession = Schemas['ChatSession'];
export type ChatMessage = Schemas['ChatMessage'];
export type Feed = Schemas['Feed'];
export type Schedule = Schemas['Schedule'];
export type GpuProcess = Schemas['GpuProcess'];
export type GPU = Schemas['GPU'];
export type CPUCore = Schemas['CPUCore'];
export type DiskUsage = Schemas['DiskUsage'];
export type TrainingJob = Schemas['TrainingJob'];
export type SystemMetrics = Schemas['SystemMetrics'];
export type VM = Schemas['VM'];
export type NetworkDevice = Schemas['NetworkDevice'];
export type ApiError = Schemas['Error'];
