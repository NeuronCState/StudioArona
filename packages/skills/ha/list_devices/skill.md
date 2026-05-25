---
name: ha.list_devices
version: 0.1.0
owner: C
scopes: [ha.read]
mac_mock: true
inputs: {}
outputs:
  devices: { type: array }
risk: low
timeout_ms: 5000
rate_limit: 20/min
---
# HomeAssistant 设备列表

列出 HomeAssistant 中注册的所有设备。

## 触发示例
- "智能家居有哪些设备"
- "HA 设备列表"
- "看看家里的设备"

## 注意
- Mac 阶段返回 mock 设备列表。
- Linux 阶段通过 HA REST API 查询。
