---
name: schedules
description: "管理日程和倒计时：创建、列表、更新、删除日程。"
metadata:
  openclaw:
    emoji: "📅"
---

# 日程管理

管理工作室日程。通过 HTTP API 调用 agent 桥接服务。

## 命令

### 列出日程

```bash
curl -s "http://localhost:18790/api/schedules"
```

### 创建日程

```bash
curl -s -X POST "http://localhost:18790/api/schedules" \
  -H "Content-Type: application/json" \
  -d '{"title": "${title}", "body": "${body}", "due_at": "${due_at}"}'
```

### 删除日程

```bash
curl -s -X DELETE "http://localhost:18790/api/schedules/${schedule_id}"
```

## 触发示例

- "创建一个明天下午3点的会议"
- "看看这周有什么安排"
- "删除那个日程"

## 注意

- 创建日程后会推 ui_action 切换到日程页面
- 支持自然语言时间解析
