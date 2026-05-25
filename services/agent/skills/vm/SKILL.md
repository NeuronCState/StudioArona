---
name: vm
description: "管理虚拟机：创建、列表、启动、停止、上传文件、销毁。"
metadata:
  openclaw:
    emoji: "🖥️"
    risk: high
---

# 虚拟机管理

管理工作室的虚拟机。通过 HTTP API 调用 perception 服务。

## 命令

### 列出虚拟机

```bash
curl -s "http://localhost:8002/api/vms"
```

### 创建虚拟机

```bash
curl -s -X POST "http://localhost:8002/api/vms" \
  -H "Content-Type: application/json" \
  -d '{"name": "${name}", "cpu": ${cpu}, "mem_gb": ${mem}, "disk_gb": ${disk}}'
```

### 启动/停止虚拟机

```bash
curl -s -X POST "http://localhost:8002/api/vms/${vm_id}/start"
curl -s -X POST "http://localhost:8002/api/vms/${vm_id}/stop"
```

### 销毁虚拟机

```bash
curl -s -X DELETE "http://localhost:8002/api/vms/${vm_id}"
```

## 触发示例

- "创建一个 4 核 8G 的虚拟机"
- "看看有哪些虚拟机"
- "销毁那个测试用的 VM"

## 注意

- 创建和销毁是高危操作，必须用户二次确认
- Mac 阶段返回 mock 数据（内存状态机模拟生命周期）
