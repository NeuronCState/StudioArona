import type { GPU } from '@/types/contracts';

interface GpuCardProps {
  gpu: GPU;
}

export function GpuCard({ gpu }: GpuCardProps) {
  const memPct = Math.round((gpu.mem_used_mb / gpu.mem_total_mb) * 100);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (memPct / 100) * circumference;

  return (
    <div className="card">
      <h3 className="mb-3 text-sm font-medium text-text-primary">{gpu.name}</h3>
      <div className="flex items-center gap-6">
        {/* Ring progress */}
        <svg width="100" height="100" className="shrink-0">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--color-border)" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
          />
          <text x="50" y="46" textAnchor="middle" className="fill-text-primary text-sm font-medium">
            {memPct}%
          </text>
          <text x="50" y="60" textAnchor="middle" className="fill-text-muted text-2xs">
            VRAM
          </text>
        </svg>

        <div className="flex-1 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-text-secondary">显存</span>
            <span className="font-mono text-text-primary">
              {gpu.mem_used_mb} / {gpu.mem_total_mb} MB
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">利用率</span>
            <span className="font-mono text-text-primary">{Math.round(gpu.util_pct)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">温度</span>
            <span className="font-mono text-text-primary">{gpu.temp_c}°C</span>
          </div>
        </div>
      </div>
    </div>
  );
}
