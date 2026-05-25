---
name: network
description: "查看局域网设备列表和设备详情。"
metadata:
  openclaw:
    emoji: "🌐"
---

# 网络设备

查看工作室局域网中的设备。通过 HTTP API 调用 perception 服务。

## 命令

### 列出设备

```bash
curl -s "http://localhost:8000/api/network/devices"
```

### 设备详情

```bash
curl -s "http://localhost:8000/api/network/devices/${device_id}"
```

## 触发示例

- "局域网里有哪些设备"
- "看看 NAS 的 IP"

## 注意

- Mac 阶段返回 mock 数据
- Linux 阶段通过 ARP 扫描获取真实设备列表
