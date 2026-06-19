import type { VM, NetworkDevice, SystemMetrics } from "@/types/contracts";

export const mockSystemMetrics: SystemMetrics = {
  ts: new Date().toISOString(),
  cpu_cores: Array.from({ length: 16 }, (_, i) => ({
    index: i,
    util_pct: Math.round(20 + Math.random() * 50),
    freq_mhz: 3200 + (i % 4) * 100,
  })),
  mem_total_mb: 64 * 1024,
  mem_used_mb: 28 * 1024 + 512,
  disks: [
    {
      mount: "/",
      total_gb: 1024,
      used_gb: 512,
      util_pct: 50,
    },
    {
      mount: "/data",
      total_gb: 2048,
      used_gb: 1280,
      util_pct: 62,
    },
  ],
  gpus: [
    {
      name: "NVIDIA V100 16GB",
      mem_total_mb: 16384,
      mem_used_mb: 4096,
      util_pct: 38,
      temp_c: 58,
      processes: [
        {
          pid: 12345,
          name: "train_llm.py",
          user: "u_zhang",
          gpu_mem_mb: 4096,
        },
      ],
    },
  ],
  training_jobs: [
    {
      id: "job_001",
      name: "LLM Fine-tune v2",
      status: "running",
      user: "u_zhang",
      gpu_util_pct: 86,
      current_step: 4200,
      total_steps: 8000,
      elapsed_h: 1.5,
      eta_h: 1.2,
    },
    {
      id: "job_002",
      name: "YOLOv8 Detection",
      status: "running",
      user: "u_li",
      gpu_util_pct: 42,
      current_step: 1200,
      total_steps: 5000,
      elapsed_h: 0.4,
      eta_h: 1.3,
    },
  ],
};

export const mockVMs: VM[] = [
  {
    id: "vm_li_dev",
    user_id: "u_zhang",
    name: "li-dev",
    hypervisor: "mock",
    spec_cpu: 4,
    spec_ram_mb: 8192,
    spec_disk_gb: 100,
    status: "running",
    ip: "192.168.10.21",
    notes: "李开发机",
    console_path: "localhost:2222",
    guest_agent_ok: true,
    exec_enabled: false,
    created_at: "2026-05-10T08:00:00Z",
  },
  {
    id: "vm_wang_cuda",
    user_id: "u_zhang",
    name: "wang-cuda",
    hypervisor: "mock",
    spec_cpu: 8,
    spec_ram_mb: 16384,
    spec_disk_gb: 200,
    status: "running",
    ip: "192.168.10.22",
    console_path: "localhost:2223",
    guest_agent_ok: true,
    exec_enabled: false,
    created_at: "2026-05-12T10:00:00Z",
  },
];

export const mockNetworkDevices: NetworkDevice[] = [
  {
    ip: "192.168.1.10",
    mac: "AA:BB:CC:DD:EE:01",
    hostname: "ubuntu-main",
    vendor: "Dell",
    online: true,
    last_seen: new Date().toISOString(),
  },
  {
    ip: "192.168.1.11",
    mac: "AA:BB:CC:DD:EE:02",
    hostname: "nas-synology",
    vendor: "Synology",
    online: true,
    last_seen: new Date().toISOString(),
  },
];
