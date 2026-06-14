export interface LineChartSimpleProps {
  data: { x: string; y: number }[];
  width?: number;
  height?: number;
  color?: string;
  label?: string;
}

export function LineChartSimple({
  data,
  width = 400,
  height = 100,
  color = 'var(--color-accent)',
  label,
}: LineChartSimpleProps) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-xs text-text-muted" style={{ height }}>
        数据不足
      </div>
    );
  }

  const maxY = Math.max(...data.map((d) => d.y), 1);
  const minY = 0;
  const range = maxY - minY || 1;
  const padding = 10;

  const points = data
    .map((d, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - ((d.y - minY) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <div className="relative">
      {label && <p className="mb-1 text-xs text-text-muted">{label}</p>}
      <svg width={width} height={height} className="overflow-hidden rounded-lg">
        {/* Area fill */}
        <polygon points={areaPoints} fill={color} opacity="0.1" />
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Data points */}
        {data.map((d, i) => {
          const x = padding + (i / (data.length - 1)) * (width - padding * 2);
          const y = height - padding - ((d.y - minY) / range) * (height - padding * 2);
          return (
            <circle key={i} cx={x} cy={y} r={3} fill={color} stroke="white" strokeWidth={1.5} />
          );
        })}
      </svg>
    </div>
  );
}
