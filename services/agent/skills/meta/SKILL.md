---
name: meta
description: "管理用户偏好和跨会话记忆：回忆、更新偏好、遗忘。"
metadata:
  openclaw:
    emoji: "🧠"
---

# 元技能：记忆与偏好

管理用户的跨会话记忆和偏好设置。

## 命令

### 回忆用户偏好

使用 OpenClaw 内置 memory 系统检索。

### 更新用户偏好

```bash
curl -s -X POST "http://localhost:18790/api/me/preferences" \
  -H "Content-Type: application/json" \
  -d '{"key": "${key}", "value": "${value}"}'
```

### 遗忘特定记忆

```bash
curl -s -X DELETE "http://localhost:18790/api/me/memories/${memory_id}"
```

## 触发示例

- "记住我喜欢咖啡"
- "我之前说过的那个偏好是什么"
- "忘掉我说过的那个"

## 注意

- 用户偏好默认私有
- 记忆有 60 天衰减，长期未命中归冷库
- 用户可在前端"我的偏好"页查看/删除全部记忆
