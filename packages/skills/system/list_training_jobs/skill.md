---
name: system.list_training_jobs
version: 0.1.0
owner: C
scopes: [system.read]
mac_mock: true
inputs: {}
outputs:
  jobs: { type: array }
risk: low
timeout_ms: 5000
rate_limit: 20/min
---
# 列出训练任务

列出当前正在运行的 GPU 训练任务。

## 触发示例
- "有什么训练任务在跑"
- "GPU 上在训练什么"
- "看看训练进度"

## 注意
- Mac 阶段返回 2 个 mock 训练任务。
- Linux 阶段通过扫描 GPU 进程 + 命名规则识别。
