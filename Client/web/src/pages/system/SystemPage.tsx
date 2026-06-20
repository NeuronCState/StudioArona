/**
 * SystemPage — react-query v5 useSuspenseQuery + ErrorBoundary 模式。
 *
 * 迁移自 useQuery + 手动 isPending/isError 分支:
 *   - useSuspenseQuery 保证 data 非空 (否则 throw promise → Suspense)
 *   - ErrorBoundary 捕获 query error → 显示 CardError
 *   - 消除组件内的 loading/error 分支, 渲染路径更纯粹
 */
import { useSuspenseQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { SystemMetrics, NetworkDevice } from "@/types/contracts";
import { CpuGrid } from "./CpuGrid";
import { GpuCard } from "./GpuCard";
import { MemoryBar } from "./MemoryBar";
import { TrainingTable } from "./TrainingTable";
import { NetworkTable } from "./NetworkTable";
import { MetricsRing } from "./MetricsRing";
import { BarChartSimple } from "./BarChartSimple";
import { CronStatusCard, type CronStatus } from "./CronStatusCard";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";

function usePageVisible() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return visible;
}

export function SystemPage() {
  const pageVisible = usePageVisible();

  // useSuspenseQuery: data is guaranteed non-null (throw → parent Suspense).
  // React 19 <Suspense> is already set up in App.tsx around AppRoutes.
  const { data: wrapped, refetch: refetchMetrics } = useSuspenseQuery({
    queryKey: ["system-metrics", "suspense"],
    queryFn: () =>
      api
        .get<SystemMetrics>("/system/metrics")
        .then((m) => ({ ...m, id: "singleton" })),
    refetchInterval: pageVisible ? 5000 : false,
  });
  const metrics = wrapped!;

  const { data: devices } = useSuspenseQuery({
    queryKey: ["network-devices"],
    queryFn: () => api.get<NetworkDevice[]>("/network/devices"),
  });

  const { data: cronStatus } = useSuspenseQuery({
    queryKey: ["cron-status"],
    queryFn: () => api.get<{ crons: CronStatus[] }>("/system/cron-status"),
    refetchInterval: 30_000,
  });

  const cpuAvg = Math.round(
    metrics.cpu_cores.reduce((a, c) => a + c.util_pct, 0) /
      metrics.cpu_cores.length,
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
          onClick={() => refetchMetrics()}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          <RefreshCw size={12} />
          刷新
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-6 @5xl:grid-cols-3">
        {/* Left: 2/3 — charts */}
        <div className="space-y-6 lg:col-span-2">
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
                    color={
                      gpuTemp > 80
                        ? "#EF4444"
                        : gpuTemp > 65
                          ? "#F59E0B"
                          : "var(--color-accent)"
                    }
                  />
                </>
              )}
            </div>
          </div>

          <div className="card">
            <h3 className="mb-3 text-sm font-medium text-[var(--color-text-primary)]">
              CPU 核心利用率
            </h3>
            <BarChartSimple
              data={metrics.cpu_cores.slice(0, 16).map((c) => ({
                label: `#${c.index}`,
                value: c.util_pct,
                max: 100,
              }))}
              height={100}
            />
          </div>

          {hasGpu && (
            <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
              {metrics.gpus.map((gpu, i) => (
                <GpuCard key={i} gpu={gpu} />
              ))}
            </div>
          )}

          {metrics.cpu_cores && <CpuGrid cores={metrics.cpu_cores} />}
        </div>

        {/* Right: 1/3 — summary + network */}
        <div className="space-y-6">
          <MemoryBar
            label="内存"
            used={metrics.mem_used_mb}
            total={metrics.mem_total_mb}
            unit="MB"
          />
          {metrics.disks.map((disk, i) => (
            <MemoryBar
              key={i}
              label={disk.mount}
              used={disk.used_gb}
              total={disk.total_gb}
              unit="GB"
            />
          ))}

          {metrics.training_jobs && metrics.training_jobs.length > 0 && (
            <TrainingTable jobs={metrics.training_jobs} />
          )}

          {devices && <NetworkTable devices={devices} />}

          {cronStatus && <CronStatusCard crons={cronStatus.crons} />}
        </div>
      </div>
    </PageLayout>
  );
}
