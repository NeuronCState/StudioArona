---
name: system.metrics_snapshot
version: 0.1.0
owner: C
scopes: [system.read]
mac_mock: true
inputs: {}
outputs:
  metrics: { type: object }
risk: low
timeout_ms: 5000
rate_limit: 20/min
---
# 硬件监控快照

获取当前系统硬件指标快照：CPU、内存、磁盘、GPU、训练任务。

## 触发示例
- "系统状态怎么样"
- "看看 CPU 和内存"
- "GPU 使用率多少"

## 注意
- Mac 阶段：CPU/mem/disk 真实，GPU 假（V100 + 抖动），training_jobs 假。
- Linux 阶段：psutil + nvidia-smi 全真实。
