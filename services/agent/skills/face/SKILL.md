---
name: face
description: "人脸注册与识别：录入工作室成员面部数据。"
metadata:
  openclaw:
    emoji: "👤"
---

# 人脸录入

注册工作室成员的人脸数据。通过 HTTP API 调用 perception 服务。

## 命令

### 录入人脸

```bash
curl -s -X POST "http://localhost:8002/api/face/enroll" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "${user_id}"}'
```

## 触发示例
- "帮我录入人脸"
- "注册一个新成员的面部数据"

## 注意
- Mac 阶段使用真实摄像头采集
- 需要用户在摄像头前停留 3-5 秒
