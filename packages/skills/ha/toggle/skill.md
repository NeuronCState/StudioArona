---
name: ha.toggle
version: 0.1.0
owner: C
scopes: [ha.write]
mac_mock: true
inputs:
  entity_id: { type: string, required: true }
outputs:
  ok: { type: boolean }
  new_state: { type: string }
risk: medium
timeout_ms: 5000
rate_limit: 30/min
---
# 切换 HomeAssistant 设备

切换 HA 设备的开/关状态。

## 触发示例
- "关灯"
- "打开空调"
- "切换投影仪"

## 注意
- Mac 阶段：mock 切换状态。
- Linux 阶段：通过 HA REST API 调用。
