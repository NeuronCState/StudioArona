/**
 * @file lib/schemas/index.ts
 * Barrel export for Zod 4 schemas.
 *
 * Usage:
 *   import { loginSchema, createVmSchema } from "@/lib/schemas";
 *   import type { LoginInput, RegisterInput } from "@/lib/schemas";
 */
// Auth — used by LoginPage
export { loginSchema, registerSchema } from "./auth";
export type { LoginInput, RegisterInput } from "./auth";

// VM — used by CreateVmForm
export { createVmSchema } from "./vm";
export type { CreateVmInput } from "./vm";

// Internal schemas (auth.ts / vm.ts / api.ts) are available for direct import
// when needed by future consumers. Not re-exported here to keep barrel lean.
