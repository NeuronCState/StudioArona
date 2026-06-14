export interface RingProgressProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export function RingProgress({
  value,
  max = 100,
  size = 80,
  strokeWidth = 8,
  label,
}: RingProgressProps) {
  const pct = Math.round((value / max) * 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <svg width={size} height={size} className="shrink-0">
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
        stroke="var(--color-accent)"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2}
        y={size / 2 - (label ? 4 : 0)}
        textAnchor="middle"
        className="fill-[var(--color-text-primary)] text-sm font-medium"
      >
        {pct}%
      </text>
      {label && (
        <text
          x={size / 2}
          y={size / 2 + 10}
          textAnchor="middle"
          className="fill-[var(--color-text-muted)] text-2xs"
        >
          {label}
        </text>
      )}
    </svg>
  );
}
