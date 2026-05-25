---
name: system
description: "查看系统硬件状态：CPU、内存、GPU、磁盘使用率。"
metadata:
  openclaw:
    emoji: "📊"
---

# 系统监控

查看工作室主机的硬件状态。通过 HTTP API 调用 perception 服务。

## 命令

### 获取系统指标

```bash
curl -s "http://localhost:8000/api/system/metrics"
```

返回 CPU 各核心使用率、内存使用、GPU 状态、磁盘空间。

### 查看训练任务

```bash
curl -s "http://localhost:8000/api/system/training_jobs"
```

## 触发示例

- "系统状态怎么样"
- "GPU 温度多少"
- "内存还够用吗"

## 注意

- Mac 阶段返回 mock 数据（读 macOS psutil 真实 CPU/内存 + 假 GPU）
- Linux 阶段通过 nvidia-smi 获取真实 GPU 数据
