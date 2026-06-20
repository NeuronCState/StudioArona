/**
 * Generic API response wrapper — Zod 4 discriminatedUnion.
 *
 * Use this as the base for any API endpoint that returns
 * `{ status: "ok", data: T } | { status: "error", message: string }`.
 * Compose with endpoint-specific data schemas via `.extend()` or `z.intersection()`.
 */
import { z } from "zod";

/** Single-item success response */
export function apiOk<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    status: z.literal("ok"),
    data: dataSchema,
  });
}

/** Array success response */
export function apiOkList<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    status: z.literal("ok"),
    data: z.array(itemSchema),
  });
}

/** Error response */
export const apiError = z.object({
  status: z.literal("error"),
  message: z.string(),
  code: z.string().optional(),
});

/** Full discriminated union for a single-item API call */
export function apiResponse<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion("status", [
    apiOk(dataSchema),
    apiError,
  ]);
}

/** Full discriminated union for a list API call */
export function apiResponseList<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.discriminatedUnion("status", [
    apiOkList(itemSchema),
    apiError,
  ]);
}

export type ApiError = z.output<typeof apiError>;
