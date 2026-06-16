import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useLocalResource } from '@/lib/storage/useLocalResource';
import type { SystemMetrics, NetworkDevice } from '@/types/contracts';
import { CpuGrid } from './CpuGrid';
import { GpuCard } from './GpuCard';
import { MemoryBar } from './MemoryBar';
import { TrainingTable } from './TrainingTable';
import { NetworkTable } from './NetworkTable';
import { MetricsRing } from './MetricsRing';
import { BarChartSimple } from './BarChartSimple';
import { Skeleton, CardError } from '@javis/ui-kit';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageLayout } from '@/components/layout/PageLayout';

function usePageVisible() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return visible;
}

function SystemSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Skeleton width={120} height={24} />
        <Skeleton width={60} height={20} />
      </div>
      <div className="card">
        <div className="flex flex-wrap items-center justify-center gap-8">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="circle" width={80} height={80} />
          ))}
        </div>
      </div>
      <div className="card space-y-3">
        <Skeleton width={140} height={16} />
        <div className="flex items-end gap-2">
          {Array.from({ length: 16 }).map((_, i) => (
            <Skeleton key={i} width={24} height={80} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Skeleton variant="rect" height={80} />
        <Skeleton variant="rect" height={80} />
      </div>
    </div>
  );
}

export function SystemPage() {
  const pageVisible = usePageVisible();

  // 本地优先 — SystemMetrics 写 storage (Tauri fs / IDB), online 时 sync server (S1b endpoint)
  // TODO: write 路径不存在 (system metrics 是只读 sensor), 标 TODO 暂不接 save/remove
  const localMetrics = useLocalResource<SystemMetrics & { id: string }>({
    table: 'system',
    queryKey: ['system-metrics', 'local'],
    serverList: () => api.get<SystemMetrics>('/system/metrics').then((m) => [{ ...m, id: 'singleton' }]),
  });

  const { data: serverMetrics, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['system-metrics'],
    queryFn: () => api.get<SystemMetrics>('/system/metrics'),
    refetchInterval: pageVisible ? 5000 : false,
  });

  // 用 local (IDB 优先) → server fallback
  const metrics = localMetrics.data?.[0] ?? serverMetrics;

  const { data: devices } = useQuery({
    queryKey: ['network-devices'],
    queryFn: () => api.get<NetworkDevice[]>('/network/devices'),
  });

  if (isLoading) {
    return <SystemSkeleton />;
  }

  if (isError || !metrics) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <CardError
          message={error?.message ?? '无法加载系统指标'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const cpuAvg = Math.round(
    metrics.cpu_cores.reduce((a, c) => a + c.util_pct, 0) / metrics.cpu_cores.length,
  );
  const memPct = Math.round((metrics.mem_used_mb / metrics.mem_total_mb) * 100);
  const hasGpu = metrics.gpus.length > 0;
  const gpuAvg = hasGpu ? Math.round(metrics.gpus[0].util_pct) : 0;
  const gpuTemp = hasGpu ? (metrics.gpus[0].temp_c ?? 0) : 0;

  return (
    <PageLayout
      title="硬件监控"
      action={
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          <RefreshCw size={12} />
          刷新
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: 2/3 — charts */}
        <div className="space-y-6 lg:col-span-2">
          {/* Metrics rings */}
          <div className="card">
            <div className="flex flex-wrap items-center justify-center gap-8">
              <MetricsRing value={cpuAvg} max={100} label="CPU" unit="%" />
              <MetricsRing value={memPct} max={100} label="内存" unit="%" />
              {hasGpu && (
                <>
                  <MetricsRing value={gpuAvg} max={100} label="GPU" unit="%" />
                  <MetricsRing
                    value={gpuTemp}
                    max={100}
                    label="GPU 温度"
                    unit="°C"
                    color={gpuTemp > 80 ? '#EF4444' : gpuTemp > 65 ? '#F59E0B' : 'var(--color-accent)'}
                  />
                </>
              )}
            </div>
          </div>

          {/* CPU bar chart */}
          <div className="card">
            <h3 className="mb-3 text-sm font-medium text-[var(--color-text-primary)]">CPU 核心利用率</h3>
            <BarChartSimple
              data={metrics.cpu_cores.slice(0, 16).map((c) => ({
                label: `#${c.index}`,
                value: c.util_pct,
                max: 100,
              }))}
              height={100}
            />
          </div>

          {/* GPU cards */}
          {hasGpu && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {metrics.gpus.map((gpu, i) => (
                <GpuCard key={i} gpu={gpu} />
              ))}
            </div>
          )}

          {/* CPU grid */}
          {metrics.cpu_cores && <CpuGrid cores={metrics.cpu_cores} />}
        </div>

        {/* Right: 1/3 — summary + network */}
        <div className="space-y-6">
          {/* Memory + disks */}
          <MemoryBar label="内存" used={metrics.mem_used_mb} total={metrics.mem_total_mb} unit="MB" />
          {metrics.disks.map((disk, i) => (
            <MemoryBar key={i} label={disk.mount} used={disk.used_gb} total={disk.total_gb} unit="GB" />
          ))}

          {/* Training jobs */}
          {metrics.training_jobs && metrics.training_jobs.length > 0 && (
            <TrainingTable jobs={metrics.training_jobs} />
          )}

          {/* Network devices */}
          {devices && <NetworkTable devices={devices} />}
        </div>
      </div>
    </PageLayout>
  );
}
