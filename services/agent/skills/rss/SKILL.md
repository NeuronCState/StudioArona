---
name: rss
description: "管理信息源：RSS 订阅（15分钟抓取）和网页监控（1分钟检测变更）。自动识别 URL 类型。"
metadata:
  openclaw:
    emoji: "📡"
---

# 信息源管理

统一管理工作室的信息源。输入 URL 自动识别类型：
- `.xml` `.rss` `.atom` 结尾 → **RSS 订阅**，rss-fetcher 每 15 分钟抓取新文章
- 普通网页 → **网页监控**，web-watcher 每 1 分钟检测页面变化

## 命令

### 列出所有信息源

```bash
curl -s "http://localhost:18790/api/feeds"           # RSS 订阅
curl -s "http://localhost:18790/api/page-monitors"    # 网页监控
```

### 添加 RSS 订阅

```bash
curl -s -X POST "http://localhost:18790/api/feeds" \
  -H "Content-Type: application/json" \
  -d '{"url": "${url}", "title": "${title}"}'
```

### 添加网页监控

```bash
curl -s -X POST "http://localhost:18790/api/page-monitors" \
  -H "Content-Type: application/json" \
  -d '{"url": "${url}", "label": "${title}", "css_selector": "body"}'
```

### 查看文章

```bash
curl -s "http://localhost:18790/api/feeds/${feed_id}/items"
```

### 删除

```bash
curl -s -X DELETE "http://localhost:18790/api/feeds/${id}"         # RSS
curl -s -X DELETE "http://localhost:18790/api/page-monitors/${id}"  # 监控
```

## 触发示例

- "订阅 https://hnrss.org/frontpage"
- "监控 https://pintia.cn/problem-sets/dashboard 的变化"
- "我有哪些信息源"
- "看看最新的 RSS 文章"
- "删除那个信息源"

## 注意

- 删除订阅后后台自动停止抓取/监控
- RSS 文章存入 feed_item 表，前端可查看
- 网页监控记录页面 hash 变化，变更时通知
