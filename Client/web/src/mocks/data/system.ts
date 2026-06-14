import type { VM, NetworkDevice } from '@/types/contracts';

export const mockSystemMetrics = {
  cpu: {
    model: '12th Gen Intel Core i7-12700',
    cores: 16,
    threads: 24,
    usage_pct: 34.2,
    temp_c: 52,
  },
  memory: {
    total_gb: 64,
    used_gb: 28.5,
    usage_pct: 44.5,
  },
  gpus: [
    {
      name: 'NVIDIA RTX 4090',
      mem_total_mb: 24576,
      mem_used_mb: 8192,
      util_pct: 45,
      temp_c: 62,
    },
  ],
  disks: [
    {
      mount: '/',
      total_gb: 1024,
      used_gb: 512,
      usage_pct: 50,
    },
  ],
  training_jobs: [
    {
      id: 'job_001',
      name: 'llama-finetune',
      status: 'running' as const,
      gpu_idx: 0,
      pid: 12345,
      user: 'u_zhang',
      gpu_mem_mb: 8192,
      eta_h: 2.5,
    },
    {
      id: 'job_002',
      name: 'sd-xl-inference',
      status: 'queued' as const,
      gpu_idx: 0,
      pid: null,
      user: 'u_li',
      gpu_mem_mb: null,
      eta_h: null,
    },
  ],
};

export const mockVMs: VM[] = [];

export const mockNetworkDevices: NetworkDevice[] = [
  {
    ip: '192.168.1.10',
    mac: 'AA:BB:CC:DD:EE:01',
    hostname: 'ubuntu-main',
    vendor: 'Dell',
    online: true,
    last_seen: new Date().toISOString(),
  },
  {
    ip: '192.168.1.11',
    mac: 'AA:BB:CC:DD:EE:02',
    hostname: 'nas-synology',
    vendor: 'Synology',
    online: true,
    last_seen: new Date().toISOString(),
  },
];
