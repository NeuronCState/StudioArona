---
name: vm.list
version: 0.1.0
owner: C
scopes: [vm.read]
mac_mock: true
inputs:
  owner_id: { type: string, optional: true }
outputs:
  vms: { type: array }
risk: low
timeout_ms: 5000
rate_limit: 20/min
---
# 列出虚拟机

列出当前用户的虚拟机，或所有虚拟机（管理员）。

## 触发示例
- "我的虚拟机有哪些"
- "列出所有 VM"
- "看看我的服务器"

## 注意
- Mac 阶段返回 mock VM 列表。
- Linux 阶段通过 VBoxManage 查询真实 VM。
