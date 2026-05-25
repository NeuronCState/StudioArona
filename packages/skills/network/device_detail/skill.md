---
name: network.device_detail
version: 0.1.0
owner: C
scopes: [network.read]
mac_mock: true
inputs:
  ip: { type: string, required: true }
outputs:
  device: { type: object }
risk: low
timeout_ms: 10000
rate_limit: 20/min
---
# 查看设备详情

查询局域网中某台设备的详细信息，包括开放端口、操作系统猜测等。

## 触发示例
- "192.168.1.10 是什么设备"
- "查看这台机器的详情"
- "这台电脑开了什么端口"

## 注意
- Mac 阶段返回 mock 设备详情。
- Linux 阶段通过 nmap 详细扫描 + SNMP 查询。
