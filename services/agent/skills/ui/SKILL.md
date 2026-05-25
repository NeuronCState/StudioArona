---
name: ui
description: "操作前端界面：切换页面、渲染卡片、高亮元素、弹出提示。"
metadata:
  openclaw:
    emoji: "🖥️"
---

# UI 操作

通过桥接服务操作前端界面。所有 UI 操作通过 SSE ui_action 事件推送给前端。

## 命令

### 切换页面

```bash
curl -s -X POST "http://localhost:18790/api/ui/action" \
  -H "Content-Type: application/json" \
  -d '{"type": "navigate", "to": "${path}"}'
```

可用路径：`/` `/feeds` `/schedules` `/system` `/chat`

### 渲染卡片

```bash
curl -s -X POST "http://localhost:18790/api/ui/action" \
  -H "Content-Type: application/json" \
  -d '{"type": "render_card", "card": "${card_type}", "data": ${data_json}}'
```

### 弹出提示

```bash
curl -s -X POST "http://localhost:18790/api/ui/action" \
  -H "Content-Type: application/json" \
  -d '{"type": "toast", "message": "${message}", "level": "info"}'
```

### 二次确认（危险操作）

```bash
curl -s -X POST "http://localhost:18790/api/ui/action" \
  -H "Content-Type: application/json" \
  -d '{"type": "confirm", "message": "${message}", "confirm_id": "${id}"}'
```

## 触发示例

- "切到信息源页"
- "显示一下系统状态"
- "弹个提示说操作完成"

## 注意

- navigate 会同时推 ui_action 给前端并回复旁白
- confirm 用于 risk: high 的操作，等用户回执后才继续
