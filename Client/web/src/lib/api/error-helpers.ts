/**
 * 拿 ApiError 是不是 OFFLINE 状态的 helper — 14 个 page 统一用.
 * CardError 的 offline prop 也由这个判断.
 */
import { ApiError } from "@/lib/api/client";

export function isOfflineError(e: unknown): boolean {
  if (e instanceof ApiError) return e.code === "OFFLINE";
  return false;
}

export function offlineErrorMessage(): string {
  return "未连接 server, 显示本地数据";
}
