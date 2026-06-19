import { useNavigate } from "react-router-dom";
import { Cpu, Server } from "lucide-react";
import type { VM } from "@/types/contracts";

interface SystemTileProps {
  vms?: VM[];
}

const statusColors: Record<VM["status"], string> = {
  queued: "bg-zinc-400",
  creating: "bg-amber-400 animate-pulse",
  running: "bg-emerald-500",
  stopped: "bg-zinc-400",
  error: "bg-red-500",
  destroyed: "bg-zinc-300",
};

const statusLabels: Record<VM["status"], string> = {
  queued: "Queued",
  creating: "Creating",
  running: "Running",
  stopped: "Stopped",
  error: "Error",
  destroyed: "Destroyed",
};

export function SystemTile({ vms }: SystemTileProps) {
  const navigate = useNavigate();
  const runningCount = vms?.filter((v) => v.status === "running").length ?? 0;
  const hasVms = vms && vms.length > 0;
  const displayVms = vms?.slice(0, 4) ?? [];

  return (
    <div className="studio-tile h-full" onClick={() => navigate("/vms")}>
      <div className="studio-tile-inner tile-anim-3">
        <div className="studio-tile-header">
          <h3>
            <Cpu size={15} className="text-emerald-500" />
            My VM System
          </h3>
          {hasVms && (
            <span className="text-[10px] text-stone-400 tabular-nums">
              {runningCount}/{vms!.length} running
            </span>
          )}
        </div>

        {hasVms ? (
          <div className="flex-1 space-y-2">
            {displayVms.map((vm) => (
              <div
                key={vm.id}
                className="flex items-center gap-2.5 rounded-lg bg-stone-50/60 px-2.5 py-2"
              >
                <Server size={13} className="shrink-0 text-stone-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-[11px] font-medium text-stone-700">
                      {vm.name}
                    </span>
                    <span
                      className={`ml-2 h-1.5 w-1.5 shrink-0 rounded-full ${statusColors[vm.status]}`}
                    />
                  </div>
                  <div className="mt-0.5 flex gap-2 text-[10px] text-stone-400">
                    <span>{vm.spec_cpu ?? "-"} CPU</span>
                    <span>
                      {vm.spec_ram_mb != null
                        ? `${(vm.spec_ram_mb / 1024).toFixed(0)}G`
                        : "-"}
                    </span>
                    <span>
                      {vm.spec_disk_gb != null ? `${vm.spec_disk_gb}G` : "-"}
                    </span>
                    <span className="text-stone-300">{vm.hypervisor}</span>
                  </div>
                </div>
              </div>
            ))}
            {vms!.length > 4 && (
              <p className="text-center text-[10px] text-stone-400">
                +{vms!.length - 4} more
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <Server size={28} className="mb-2 text-stone-300" />
            <p className="text-[12px] font-medium text-stone-500">No VMs yet</p>
            <p className="mt-0.5 text-[10px] text-stone-400">
              Create a VM to get started
            </p>
          </div>
        )}

        <div className="mt-auto space-y-1.5 border-t border-stone-100 pt-2.5">
          {hasVms ? (
            displayVms.map((vm) => (
              <div key={vm.id} className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${statusColors[vm.status]}`}
                />
                <span className="truncate text-[11px] text-stone-500">
                  {vm.name}
                </span>
                <span className="ml-auto text-[10px] text-stone-400">
                  {statusLabels[vm.status]}
                </span>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-stone-300" />
              <span className="text-[11px] text-stone-400">
                No virtual machines
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
