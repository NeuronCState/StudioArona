interface MemoryBarProps {
  label: string;
  used: number;
  total: number;
  unit: string;
}

export function MemoryBar({ label, used, total, unit }: MemoryBarProps) {
  const pct = Math.round((used / total) * 100);

  return (
    <div className="card">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        <span className="font-mono text-xs text-text-muted">
          {used} / {total} {unit} ({pct}%)
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
