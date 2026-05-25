---
name: vm.start
version: 0.1.0
owner: C
scopes: [vm.write]
mac_mock: true
inputs:
  vm_id: { type: string, required: true }
outputs:
  ok: { type: boolean }
risk: low
timeout_ms: 10000
rate_limit: 10/min
---
# 启动虚拟机

启动一台已停止的虚拟机。

## 触发示例
- "启动虚拟机 vm_xxx"
- "开机"
- "start vm"

## 注意
- Mac 阶段：mock 直接切换状态。
- Linux 阶段：VBoxManage startvm。
