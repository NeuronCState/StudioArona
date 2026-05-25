---
name: network.list_devices
version: 0.1.0
owner: C
scopes: [network.read]
mac_mock: true
inputs: {}
outputs:
  devices: { type: array }
risk: low
timeout_ms: 10000
rate_limit: 10/min
---
# 列出局域网设备

扫描并列出当前局域网中的所有设备。

## 触发示例
- "局域网有哪些设备"
- "扫描网络"
- "看看谁在线"

## 注意
- Mac 阶段返回 12 台 mock 设备（PC/VM/路由/打印机等），随机几台 offline。
- Linux 阶段通过 nmap ping scan + ARP 表查询真实设备。
