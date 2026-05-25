---
name: vm.stop
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
# 停止虚拟机

停止一台运行中的虚拟机。

## 触发示例
- "停止虚拟机 vm_xxx"
- "关机"
- "stop vm"

## 注意
- Mac 阶段：mock 直接切换状态。
- Linux 阶段：VBoxManage controlvm acpipowerbutton。
