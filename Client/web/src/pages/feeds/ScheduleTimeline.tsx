import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Bot } from "lucide-react";
import { api } from "@/lib/api/client";
import { formatCountdown } from "@/lib/utils";
import type { Schedule } from "@/types/contracts";

interface ScheduleTimelineProps {
  scope: "personal" | "shared";
}

function isWithin24h(dueAt: string): boolean {
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  const diffMs = due - now;
  return diffMs > 0 && diffMs < 24 * 60 * 60_000;
}

function isPastDue(dueAt: string): boolean {
  return new Date(dueAt).getTime() < Date.now();
}

function formatTime(dueAt: string): string {
  const d = new Date(dueAt);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ScheduleTimeline({ scope }: ScheduleTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    data: schedules,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["schedules", scope],
    queryFn: () => api.get<Schedule[]>(`/schedules?scope=${scope}`),
  });

  if (isLoading) {
    return (
      <div className="py-4 text-center text-sm text-text-muted">
        加载日程中...
      </div>
    );
  }

  if (isError || !schedules) {
    return (
      <div className="py-4 text-center text-sm text-text-muted">
        日程加载失败，请稍后重试。
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-text-muted">
        暂无日程安排
      </div>
    );
  }

  const toggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-0">
      {schedules.map((item, i) => {
        const urgent = isWithin24h(item.starts_at);
        const expired = isPastDue(item.starts_at);
        const expanded = expandedId === item.id;
        const isLast = i === schedules.length - 1;

        return (
          <div key={item.id} className="relative">
            {/* Timeline connector line */}
            {!isLast && (
              <div className="absolute left-[39px] top-10 bottom-0 w-px bg-border" />
            )}

            <button
              onClick={() => toggle(item.id)}
              className={`flex w-full items-start gap-4 px-1 py-2 text-left transition-colors hover:bg-surface ${
                expired ? "opacity-60" : ""
              }`}
            >
              {/* Time column */}
              <div className="flex w-16 shrink-0 flex-col items-end pt-0.5">
                <span
                  className={`text-xs tabular-nums ${
                    urgent ? "font-semibold text-accent" : "text-text-muted"
                  }`}
                >
                  {formatTime(item.starts_at)}
                </span>
              </div>

              {/* Dot + content */}
              <div className="flex flex-1 gap-3">
                {/* Timeline dot */}
                <div
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
                    expired
                      ? "border-text-muted bg-transparent"
                      : urgent
                        ? "border-accent bg-accent"
                        : "border-text-muted bg-surface-raised"
                  }`}
                />

                <div className="min-w-0 flex-1">
                  {/* Title + badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        expired
                          ? "text-text-muted line-through"
                          : "text-text-primary"
                      }`}
                    >
                      {item.title}
                    </span>
                    {expired && (
                      <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-muted">
                        已过期
                      </span>
                    )}
                    {item.source === "agent" && (
                      <span className="inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">
                        <Bot size={10} />
                        由阿洛娜创建
                      </span>
                    )}
                  </div>

                  {/* Body preview (collapsed) */}
                  {!expanded && item.body && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">
                      {item.body}
                    </p>
                  )}

                  {/* Countdown */}
                  <div className="mt-1">
                    {urgent ? (
                      <span className="text-lg font-semibold tabular-nums text-accent">
                        {formatCountdown(item.starts_at)}
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted">
                        {expired ? "已过期" : formatCountdown(item.starts_at)}
                      </span>
                    )}
                  </div>

                  {/* Expanded full body */}
                  {expanded && item.body && (
                    <div className="mt-3 rounded-lg border border-border bg-surface p-3">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                        {item.body}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Expand/collapse chevron */}
              <div className="shrink-0 pt-0.5 text-text-muted">
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
