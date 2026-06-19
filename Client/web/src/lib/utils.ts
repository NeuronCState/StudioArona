import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} 小时前`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD} 天前`;
}

export function formatCountdown(dueAt: string): string {
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  const diffMs = due - now;

  if (diffMs < 0) return "已过期";
  const diffH = Math.floor(diffMs / 3_600_000);
  if (diffH < 24) {
    const diffM = Math.floor((diffMs % 3_600_000) / 60_000);
    return `${diffH}h ${diffM}m`;
  }
  const diffD = Math.floor(diffH / 24);
  return `${diffD} 天 ${diffH % 24}h`;
}
