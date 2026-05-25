---
name: nas.list_recent
version: 0.1.0
owner: C
scopes: [nas.read]
mac_mock: true
inputs:
  limit: { type: integer, default: 10 }
  user_id: { type: string, optional: true }
outputs:
  items: { type: array }
risk: low
timeout_ms: 5000
rate_limit: 20/min
---
# NAS 最近文件

查询 NAS 最近存入的文件，可按用户过滤。

## 触发示例
- "NAS 最近有什么文件"
- "看看最近上传的东西"
- "nas 最新文件"

## 注意
- Mac 阶段返回 mock 文件列表（含用户/大小/时间）。
- Linux 阶段通过 Samba/NFS 挂载点查询。
