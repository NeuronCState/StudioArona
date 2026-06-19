export interface BarChartSimpleProps {
  data: { label: string; value: number; max: number }[];
  height?: number;
}

export function BarChartSimple({ data, height = 120 }: BarChartSimpleProps) {
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((item, i) => {
        const pct = Math.min(100, (item.value / item.max) * 100);
        return (
          <div
            key={i}
            className="group relative flex flex-1 flex-col items-center"
            style={{ height: "100%" }}
          >
            <div className="flex w-full flex-1 items-end rounded-t-sm bg-surface">
              <div
                className="w-full rounded-t-sm transition-all duration-500"
                style={{
                  height: `${pct}%`,
                  backgroundColor:
                    pct > 90
                      ? "#EF4444"
                      : pct > 70
                        ? "#F59E0B"
                        : "var(--color-accent)",
                }}
              />
            </div>
            {/* Tooltip on hover */}
            <div className="absolute -top-8 hidden rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-white group-hover:block whitespace-nowrap">
              {item.label}: {Math.round(item.value)} / {item.max}
            </div>
            <span className="mt-1 text-2xs text-text-muted truncate w-full text-center">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
