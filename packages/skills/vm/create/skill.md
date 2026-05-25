---
name: vm.create
version: 0.1.0
owner: C
scopes: [vm.write]
mac_mock: true
inputs:
  name: { type: string, required: true }
  cpu: { type: integer, default: 2, min: 1, max: 8 }
  mem_gb: { type: integer, default: 4, min: 2, max: 16 }
  disk_gb: { type: integer, default: 20, min: 10, max: 200 }
  image: { type: string, enum: [ubuntu-22.04, cuda-12.x], default: ubuntu-22.04 }
  owner_id: { type: string, default: default }
outputs:
  vm: { type: object }
risk: high
timeout_ms: 15000
rate_limit: 5/min
---
# 创建虚拟机

申请创建一台新虚拟机。Mac 阶段模拟 8 秒创建延迟。

## 触发示例
- "帮我创建一台虚拟机"
- "申请一台 4 核 8G 的服务器"
- "开一台 GPU 机器"

## 注意
- Mac 阶段：mock 状态机，8 秒后自动变为 running。
- Linux 阶段：通过 VBoxManage 创建真实 VM。
- risk=high，需要二次确认。
