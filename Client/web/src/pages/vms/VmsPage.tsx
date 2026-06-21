import { useState } from "react";
import { isOfflineError } from "@/lib/api/error-helpers";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Terminal, Server } from "lucide-react";
import { api } from "@/lib/api/client";
import type { VM } from "@/types/contracts";
import { Skeleton, CardError, CardEmpty } from "@javis/ui-kit";
import { CreateVmForm } from "./CreateVmForm";
import { VmDetail } from "./VmDetail";
import { PageLayout } from "@/components/layout/PageLayout";
import { SlideOver } from "@/components/ui/SlideOver";
import { Drawer } from "@/components/ui/Drawer";
import { StudioServiceOffline } from "@/components/studio/StudioServiceOffline";
import { useConnectionStore } from "@/stores/connection";
import { useT } from "@/lib/i18n";

function VmListSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Skeleton width={100} height={24} />
        <Skeleton width={100} height={36} />
      </div>
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rect" height={100} />
        ))}
      </div>
    </div>
  );
}

export function VmsPage() {
  const tr = useT();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedVm, setSelectedVm] = useState<VM | null>(null);

  const {
    data: vms,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["vms"],
    queryFn: () => api.get<VM[]>("/vms"),
    enabled: useConnectionStore.getState().effectiveMode() === "online", // 离线不发请求
  });

  const destroyMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/vms/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vms"] });
      setSelectedVm(null);
    },
  });

  const statusColors: Record<VM["status"], string> = {
    queued: "bg-zinc-400",
    creating: "bg-amber-400 animate-pulse",
    running: "bg-green-500",
    stopped: "bg-zinc-400",
    error: "bg-red-500",
    destroyed: "bg-zinc-300",
  };

  const statusLabels: Record<VM["status"], string> = {
    queued: tr("vm.status.queued"),
    creating: tr("vm.status.creating"),
    running: tr("vm.status.running"),
    stopped: tr("vm.status.stopped"),
    error: tr("vm.status.error"),
    destroyed: tr("vm.status.destroyed"),
  };

  // 离线先于 loading/error 判: 工作室服务需 server, 没连接时不打 server
  if (useConnectionStore.getState().effectiveMode() !== "online") {
    return <StudioServiceOffline service="vms" onRetry={() => refetch()} />;
  }

  if (isLoading) {
    return <VmListSkeleton />;
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <CardError
          offline={isOfflineError(error)}
          message={error?.message}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <>
      <PageLayout
        subtitle="VMs"
        title={tr("vm.title")}
        description={tr("vm.description")}
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary gap-2"
          >
            <Plus size={16} />
            {tr("vm.request")}
          </button>
        }
      >
        <Drawer
          open={showCreate}
          onClose={() => setShowCreate(false)}
          from="right"
          title={tr("vm.request")}
          width="560px"
        >
          <CreateVmForm
            onClose={() => setShowCreate(false)}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ["vms"] });
              setShowCreate(false);
            }}
          />
        </Drawer>

        {vms && vms.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
            {vms.map((vm) => (
              <div
                key={vm.id}
                className="card cursor-pointer"
                onClick={() => setSelectedVm(vm)}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server
                      size={16}
                      className="text-[var(--color-text-muted)]"
                    />
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">
                      {vm.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${statusColors[vm.status]}`}
                    />
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {statusLabels[vm.status]}
                    </span>
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-[var(--color-text-secondary)]">
                  <span>{vm.spec_cpu ?? "-"} 核</span>
                  <span>
                    {vm.spec_ram_mb != null
                      ? `${(vm.spec_ram_mb / 1024).toFixed(1)} GB`
                      : "-"}
                  </span>
                  <span>
                    {vm.spec_disk_gb != null ? `${vm.spec_disk_gb} GB` : "-"}
                  </span>
                  <span className="text-[var(--color-text-muted)]">
                    {vm.hypervisor}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <CardEmpty
            hint={tr("vm.firstHint")}
            cta={tr("vm.first")}
            onCta={() => setShowCreate(true)}
            icon={
              <Terminal size={32} className="text-[var(--color-text-muted)]" />
            }
          />
        )}
      </PageLayout>

      <SlideOver
        open={selectedVm !== null}
        onClose={() => setSelectedVm(null)}
        title={selectedVm?.name ?? "VM 详情"}
      >
        {selectedVm && (
          <VmDetail
            vm={selectedVm}
            onBack={() => setSelectedVm(null)}
            onDestroy={() => destroyMutation.mutate(selectedVm.id)}
          />
        )}
      </SlideOver>
    </>
  );
}
