---
name: nas.search
version: 0.1.0
owner: C
scopes: [nas.read]
mac_mock: true
inputs:
  query: { type: string, required: true }
  limit: { type: integer, default: 10 }
outputs:
  items: { type: array }
risk: low
timeout_ms: 10000
rate_limit: 10/min
---
# NAS 搜索

在 NAS 中搜索文件。

## 触发示例
- "在 NAS 里找 training 相关的文件"
- "搜索 project 关键词"
- "nas search xxx"

## 注意
- Mac 阶段返回 mock 搜索结果。
- Linux 阶段通过文件名匹配 + 内容索引搜索。
