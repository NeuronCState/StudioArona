import { useState } from "react";
import { Trash2, Upload } from "lucide-react";
import type { VM } from "@/types/contracts";
import { XTermTerminal } from "./XTermTerminal";

interface VmDetailProps {
  vm: VM;
  onBack: () => void;
  onDestroy: () => void;
}

export function VmDetail({ vm, onBack: _onBack, onDestroy }: VmDetailProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const handleUpload = () => {
    // Mock upload progress
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev === null || prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setUploadProgress(null), 1000);
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 200);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <span>
          {vm.spec_cpu ?? "-"} 核 /{" "}
          {vm.spec_ram_mb != null
            ? `${(vm.spec_ram_mb / 1024).toFixed(0)} GB`
            : "-"}{" "}
          / {vm.spec_disk_gb ?? "-"} GB / {vm.hypervisor}
        </span>
      </div>

      {/* Web SSH terminal */}
      {vm.status === "running" && (
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-text-secondary)]">
            <span className="font-mono">SSH: {vm.console_path ?? "N/A"}</span>
          </div>
          <XTermTerminal
            host="localhost"
            port={vm.console_path ? 2222 : undefined}
            mockMode
          />
        </div>
      )}

      {/* Upload area */}
      <div className="card">
        <div className="mb-2 flex items-center gap-2 text-[var(--color-text-secondary)]">
          <Upload size={16} />
          <span className="text-xs font-medium">上传文件</span>
        </div>
        <div
          className="flex h-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          onClick={handleUpload}
        >
          {uploadProgress !== null ? (
            <div className="w-3/4">
              <div className="mb-1 flex justify-between text-xs">
                <span>上传中...</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface)]">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                  style={{ width: `${Math.min(uploadProgress, 100)}%` }}
                />
              </div>
            </div>
          ) : (
            "拖拽文件到此处或点击上传"
          )}
        </div>
      </div>

      {/* Destroy */}
      <div className="card border-red-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              销毁虚拟机
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              此操作不可逆
            </p>
          </div>
          {showConfirm ? (
            <div className="flex gap-2">
              <button
                onClick={onDestroy}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-xs text-white hover:bg-red-600"
              >
                确认销毁
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="btn-secondary text-xs"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} />
              销毁
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
