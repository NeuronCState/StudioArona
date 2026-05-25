---
name: vm.destroy
version: 0.1.0
owner: C
scopes: [vm.write]
mac_mock: true
inputs:
  vm_id: { type: string, required: true }
  confirm: { type: boolean, default: false }
outputs:
  ok: { type: boolean }
risk: high
timeout_ms: 10000
rate_limit: 5/min
---
# 销毁虚拟机

永久销毁一台虚拟机。不可逆操作，需要二次确认。

## 触发示例
- "销毁虚拟机 vm_xxx"
- "删除这台 VM"
- "destroy vm"

## 注意
- risk=high，必须二次确认。
- 操作会被记录到审计日志。
- Mac 阶段：mock 标记为 destroyed。
- Linux 阶段：VBoxManage unregistervm --delete。
