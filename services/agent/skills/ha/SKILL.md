---
name: ha
description: "管理 HomeAssistant 设备：查看设备列表、开关设备。"
metadata:
  openclaw:
    emoji: "🏠"
---

# HomeAssistant 设备管理

控制工作室的智能家居设备。通过 HTTP API 调用 perception 服务。

## 命令

### 列出设备

```bash
curl -s "http://localhost:8002/api/ha/devices"
```

### 切换设备开关 (risk: medium)

```bash
curl -s -X POST "http://localhost:8002/api/ha/devices/${entity_id}/toggle" \
  -H "Content-Type: application/json"
```

## 触发示例
- "工作室有哪些智能设备"
- "关掉工作室主灯"
- "打开空调"

## 注意
- Mac 阶段返回 mock 数据
- 切换设备是 medium risk，自动执行但记录日志
