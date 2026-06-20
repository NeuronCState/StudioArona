/**
 * @file lib/schemas/index.ts
 * Barrel export for all Zod 4 schemas.
 *
 * Usage:
 *   import { loginSchema, vmSchema, apiResponse } from "@/lib/schemas";
 *   import type { LoginInput, VM } from "@/lib/schemas";
 */
export {
  loginSchema,
  registerSchema,
  userProfileSchema,
  authTokensSchema,
  authResponseSchema,
} from "./auth";
export type {
  LoginInput,
  LoginOutput,
  RegisterInput,
  RegisterOutput,
  UserProfile,
  AuthTokens,
  AuthResponse,
} from "./auth";

export {
  createVmSchema,
  vmSchema,
  vmApiResponseSchema,
  VM_STATUSES,
} from "./vm";
export type {
  CreateVmInput,
  CreateVmOutput,
  VM,
  VmApiResponse,
  VmStatus,
} from "./vm";

export {
  apiOk,
  apiOkList,
  apiError,
  apiResponse,
  apiResponseList,
} from "./api";
export type { ApiError } from "./api";
