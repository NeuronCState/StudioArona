import { onCLS, onLCP, onINP, onFCP, onTTFB } from 'web-vitals';

interface VitalsMetric {
  name: string;
  value: number;
  id: string;
  rating: 'good' | 'needs-improvement' | 'poor';
}

const THRESHOLDS: Record<string, [number, number]> = {
  CLS: [0.1, 0.25],
  LCP: [2500, 4000],
  INP: [200, 500],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

function rateMetric(name: string, value: number): VitalsMetric['rating'] {
  const [good, poor] = THRESHOLDS[name] ?? [Infinity, Infinity];
  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

function sendBeacon(metric: VitalsMetric): void {
  const payload = JSON.stringify({
    kind: 'web-vital',
    name: metric.name,
    value: metric.value,
    id: metric.id,
    rating: metric.rating,
    ts: Date.now(),
    url: location.pathname,
  });

  // Use sendBeacon for reliable delivery even when page is unloading
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/internal/metrics', payload);
  } else {
    // Fallback: fire-and-forget fetch (won't block unload)
    fetch('/api/internal/metrics', {
      method: 'POST',
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
}

/**
 * Initialises Web Vitals monitoring.
 * Only reports in production mode.
 * Sends metrics to /api/internal/metrics via navigator.sendBeacon.
 */
export function initVitals(): void {
  if (!import.meta.env.PROD) return;

  const report = (metric: VitalsMetric) => {
    // Log to console in dev-like builds for debugging
    if (import.meta.env.DEV) {
      console.debug(`[vitals] ${metric.name}=${metric.value} (${metric.rating})`);
    }
    sendBeacon(metric);
  };

  const wrap = (name: string) => (m: { value: number; id: string }) =>
    report({ name, value: m.value, id: m.id, rating: rateMetric(name, m.value) });

  onCLS(wrap('CLS'));
  onLCP(wrap('LCP'));
  onINP(wrap('INP'));
  onFCP(wrap('FCP'));
  onTTFB(wrap('TTFB'));
}
