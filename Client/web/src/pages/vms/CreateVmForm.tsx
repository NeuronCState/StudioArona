import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { VM } from "@/types/contracts";

const vmSchema = z.object({
  name: z.string().min(1, "请输入名称"),
  spec_cpu: z.coerce.number().int().min(1).max(8),
  spec_ram_mb: z.coerce.number().int().min(2048).max(16384),
  spec_disk_gb: z.coerce.number().int().min(10).max(200),
  hypervisor: z.enum(["libvirt", "vbox", "mock"]),
});

type VmFormInput = z.input<typeof vmSchema>;
type VmForm = z.output<typeof vmSchema>;

interface CreateVmFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateVmForm({ onClose, onSuccess }: CreateVmFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VmFormInput, undefined, VmForm>({
    resolver: zodResolver(vmSchema),
    defaultValues: {
      spec_cpu: 2,
      spec_ram_mb: 4096,
      spec_disk_gb: 50,
      hypervisor: "mock",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: VmForm) => api.post<VM>("/vms", data),
    onSuccess,
  });

  return (
    <div className="card motion-slide-up space-y-4">
      <h3 className="text-sm font-medium text-text-primary">申请虚拟机</h3>

      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="space-y-3"
      >
        <div>
          <label className="mb-1 block text-xs text-text-secondary">名称</label>
          <input {...register("name")} className="input" placeholder="my-vm" />
          {errors.name && (
            <p className="text-xs text-red-500">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-text-secondary">
            CPU 核数
          </label>
          <input
            type="range"
            min={1}
            max={8}
            {...register("spec_cpu")}
            className="w-full accent-accent"
          />
          <span className="text-xs text-text-muted">1–8 核</span>
        </div>

        <div>
          <label className="mb-1 block text-xs text-text-secondary">
            内存 (MB)
          </label>
          <input
            type="range"
            min={2048}
            max={16384}
            step={1024}
            {...register("spec_ram_mb")}
            className="w-full accent-accent"
          />
          <span className="text-xs text-text-muted">2048–16384 MB</span>
        </div>

        <div>
          <label className="mb-1 block text-xs text-text-secondary">
            硬盘 (GB)
          </label>
          <input
            {...register("spec_disk_gb")}
            className="input"
            type="number"
            min={10}
            max={200}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-text-secondary">
            Hypervisor
          </label>
          <select {...register("hypervisor")} className="input">
            <option value="mock">Mock (开发)</option>
            <option value="libvirt">libvirt</option>
            <option value="vbox">VirtualBox</option>
          </select>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="btn-primary"
          >
            {mutation.isPending ? "提交中..." : "提交"}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">
            取消
          </button>
        </div>
      </form>
    </div>
  );
}
