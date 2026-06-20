/**
 * CreateVmForm — React 19 useActionState + <form action> 模式。
 *
 * 替代了之前的 react-hook-form + zodResolver + useMutation 三件套:
 *   1. useActionState 统一管理 submit 状态 / 验证错误 / server 错误
 *   2. <form action={formAction}> 替代 onSubmit + handleSubmit
 *   3. Zod schema 从 @/lib/schemas 引用 (SSOT)
 *   4. input name 属性替代 register()
 */
import { useActionState, useEffect, useRef } from "react";
import { createVmSchema } from "@/lib/schemas";
import { api } from "@/lib/api/client";
import type { VM } from "@/types/contracts";

interface VmFormState {
  errors: Record<string, string>;
  serverError?: string;
  success: boolean;
}

interface CreateVmFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateVmForm({ onClose, onSuccess }: CreateVmFormProps) {
  const callbacks = useRef({ onSuccess, onClose });
  callbacks.current = { onSuccess, onClose };

  const [state, formAction, isPending] = useActionState(
    async (_prev: VmFormState, formData: FormData) => {
      const raw = {
        name: formData.get("name"),
        spec_cpu: formData.get("spec_cpu"),
        spec_ram_mb: formData.get("spec_ram_mb"),
        spec_disk_gb: formData.get("spec_disk_gb"),
        hypervisor: formData.get("hypervisor"),
      };

      const result = createVmSchema.safeParse(raw);
      if (!result.success) {
        const errors: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const field = issue.path[0] as string;
          if (!errors[field]) errors[field] = issue.message;
        }
        return { errors, success: false };
      }

      const noErrors: Record<string, string> = {};

      try {
        await api.post<VM>("/vms", result.data);
        return { errors: noErrors, success: true };
      } catch (e) {
        return {
          errors: noErrors,
          serverError: (e as Error).message ?? "创建 VM 失败",
          success: false,
        };
      }
    },
    { errors: {}, success: false } satisfies VmFormState,
  );

  useEffect(() => {
    if (state.success) callbacks.current.onSuccess();
  }, [state.success]);

  const fieldError = (name: string) => {
    const msg = state.errors[name];
    return msg ? <p className="text-xs text-red-500">{msg}</p> : null;
  };

  return (
    <div className="card motion-slide-up space-y-4">
      <h3 className="text-sm font-medium text-text-primary">申请虚拟机</h3>

      <form action={formAction} className="space-y-3">
        <div>
          <label htmlFor="vm-name" className="mb-1 block text-xs text-text-secondary">
            名称
          </label>
          <input
            id="vm-name"
            name="name"
            className="input"
            placeholder="my-vm"
            defaultValue=""
          />
          {fieldError("name")}
        </div>

        <div>
          <label htmlFor="vm-cpu" className="mb-1 block text-xs text-text-secondary">
            CPU 核数
          </label>
          <input
            id="vm-cpu"
            name="spec_cpu"
            type="range"
            min={1}
            max={8}
            defaultValue={2}
            className="w-full accent-accent"
          />
          <span className="text-xs text-text-muted">1–8 核</span>
        </div>

        <div>
          <label htmlFor="vm-ram" className="mb-1 block text-xs text-text-secondary">
            内存 (MB)
          </label>
          <input
            id="vm-ram"
            name="spec_ram_mb"
            type="range"
            min={2048}
            max={16384}
            step={1024}
            defaultValue={4096}
            className="w-full accent-accent"
          />
          <span className="text-xs text-text-muted">2048–16384 MB</span>
        </div>

        <div>
          <label htmlFor="vm-disk" className="mb-1 block text-xs text-text-secondary">
            硬盘 (GB)
          </label>
          <input
            id="vm-disk"
            name="spec_disk_gb"
            className="input"
            type="number"
            min={10}
            max={200}
            defaultValue={50}
          />
        </div>

        <div>
          <label htmlFor="vm-hv" className="mb-1 block text-xs text-text-secondary">
            Hypervisor
          </label>
          <select id="vm-hv" name="hypervisor" className="input" defaultValue="mock">
            <option value="mock">Mock (开发)</option>
            <option value="libvirt">libvirt</option>
            <option value="vbox">VirtualBox</option>
          </select>
        </div>

        {state.serverError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            创建失败: {state.serverError}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={isPending} className="btn-primary">
            {isPending ? "提交中..." : "提交"}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">
            取消
          </button>
        </div>
      </form>
    </div>
  );
}
