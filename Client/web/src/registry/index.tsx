import { registerComponent } from '@/lib/component-registry';

// Demo component: SystemMetricCard
function SystemMetricCard({ label, value, unit, trend }: Record<string, unknown>) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-1)]">
      <p className="text-xs text-[var(--color-text-muted)]">{String(label)}</p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-[var(--color-text-primary)]">
          {String(value)}
        </span>
        <span className="text-xs text-[var(--color-text-secondary)]">{String(unit)}</span>
      </div>
      {trend !== undefined && (
        <p
          className={`mt-1 text-xs ${
            Number(trend) >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
          }`}
        >
          {Number(trend) >= 0 ? '↑' : '↓'} {Math.abs(Number(trend))}%
        </p>
      )}
    </div>
  );
}

// Demo component: ConfirmCard
function ConfirmCard({ message, action }: Record<string, unknown>) {
  return (
    <div className="rounded-xl border border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-4">
      <p className="text-sm text-[var(--color-text-primary)]">{String(message)}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          {String(action)}
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
}

// Demo component: WeatherCard
function WeatherCard({ city, temp, condition, icon }: Record<string, unknown>) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-1)]">
      <span className="text-3xl">{String(icon ?? '☀️')}</span>
      <div>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{String(city)}</p>
        <p className="text-xs text-[var(--color-text-secondary)]">{String(condition)}</p>
      </div>
      <span className="ml-auto text-xl font-semibold text-[var(--color-text-primary)]">
        {String(temp)}°
      </span>
    </div>
  );
}

// Register all components
registerComponent('SystemMetricCard', SystemMetricCard);
registerComponent('ConfirmCard', ConfirmCard);
registerComponent('WeatherCard', WeatherCard);
