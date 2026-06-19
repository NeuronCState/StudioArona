import type { CPUCore } from "@/types/contracts";

interface CpuGridProps {
  cores: CPUCore[];
}

export function CpuGrid({ cores }: CpuGridProps) {
  return (
    <div className="card">
      <h3 className="mb-3 text-sm font-medium text-text-primary">
        CPU ({cores.length} 核)
      </h3>
      <div className="grid grid-cols-8 gap-1 sm:grid-cols-16">
        {cores.map((core) => (
          <div
            key={core.index}
            className="flex flex-col items-center gap-0.5"
            title={`Core ${core.index}: ${Math.round(core.util_pct)}% @ ${core.freq_mhz}MHz`}
          >
            <div className="relative h-10 w-full overflow-hidden rounded bg-surface">
              <div
                className="absolute bottom-0 w-full rounded bg-accent transition-all duration-300"
                style={{ height: `${core.util_pct}%` }}
              />
            </div>
            <span className="text-2xs text-text-muted">{core.index}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
