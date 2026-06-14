export interface MetricsRingProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  unit: string;
  color?: string;
}

export function MetricsRing({
  value,
  max,
  size = 120,
  strokeWidth = 10,
  label,
  unit,
  color = 'var(--color-accent)',
}: MetricsRingProps) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x={size / 2}
          y={size / 2 - 6}
          textAnchor="middle"
          className="fill-[var(--color-text-primary)] text-lg font-semibold"
        >
          {pct}
        </text>
        <text
          x={size / 2}
          y={size / 2 + 12}
          textAnchor="middle"
          className="fill-[var(--color-text-muted)] text-2xs"
        >
          {unit}
        </text>
      </svg>
      <span className="text-xs text-text-secondary">{label}</span>
    </div>
  );
}
