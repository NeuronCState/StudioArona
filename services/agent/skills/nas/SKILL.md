---
name: nas
description: "查询 NAS 文件系统：最近文件、按用户搜索、文件详情。"
metadata:
  openclaw:
    emoji: "📁"
---

# NAS 文件查询

查询工作室 NAS 上的文件。通过 HTTP API 调用 perception 服务。

## 命令

### 查询最近文件

```bash
curl -s "http://localhost:8000/api/nas/list_recent?limit=${limit:-10}"
```

### 按用户搜索

```bash
curl -s "http://localhost:8000/api/nas/search?user=${user}&query=${query}"
```

## 触发示例

- "最近 NAS 存了啥"
- "张三上周存了什么文件"
- "搜索 NAS 上的 PDF"

## 注意

- Mac 阶段 perception 服务返回 mock 数据
- Linux 阶段通过 Samba 挂载点读取
- 默认 limit 10，最大 50
