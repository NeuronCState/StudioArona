/**
 * Auth schemas — Zod 4 with z.uuid() for user identity validation.
 *
 * Extracted from LoginPage inline schemas to a single source of truth shared
 * between LoginPage, auth store, and API validation layers.
 */
import { z } from "zod";

// ── Login ──
export const loginSchema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});
export type LoginInput = z.input<typeof loginSchema>;
export type LoginOutput = z.output<typeof loginSchema>;

// ── Register ──
export const registerSchema = z.object({
  username: z.string().min(2, "用户名至少 2 个字符"),
  displayName: z.string().min(1, "请输入显示名"),
  password: z.string().min(6, "密码至少 6 位"),
});
export type RegisterInput = z.input<typeof registerSchema>;
export type RegisterOutput = z.output<typeof registerSchema>;

// ── User profile (from API response) ──
export const userProfileSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  display_name: z.string(),
  role: z.enum(["admin", "user"]),
  created_at: z.string().datetime(),
  preferences: z.record(z.string(), z.unknown()).default({}),
  email: z.string().email().nullable().optional(),
  notify_by_email: z.boolean().optional(),
  face_enrolled: z.boolean().default(false),
});
export type UserProfile = z.output<typeof userProfileSchema>;

// ── Auth tokens (API response) ──
export const authTokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
});
export type AuthTokens = z.output<typeof authTokensSchema>;

// ── Login response (discriminated union) ──
export const authResponseSchema = z.discriminatedUnion("__type", [
  z.object({
    __type: z.literal("ok"),
    access_token: z.string(),
    refresh_token: z.string(),
    user: userProfileSchema,
  }),
  z.object({
    __type: z.literal("error"),
    message: z.string(),
    code: z.string().optional(),
  }),
]);
export type AuthResponse = z.output<typeof authResponseSchema>;
