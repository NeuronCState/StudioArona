# Server/center/

**v3 Linux 中心 daemon** (Phase 3, 2 周) — 工作室协作能力后端。

跟 `desktop-core` 物理分离: 跑在工作室 Linux 工作站, 桌面 app 通过 HTTP/JWT 连过来。

## 职责

| 能力 | 实现 |
|---|---|
| 跨用户 RSS 聚合 + 推送 | RSS daemon + email |
| VM 编排 (libvirt / VirtualBox) | virt API |
| NAS 用户系统 (配额 + 权限) | PG schema |
| HomeAssistant 网关 (LAN 设备控制) | long-lived HTTP client |
| 摄像头 / 人脸识别 (ONNX Runtime) | ONNX Runtime (可选) |
| 反向 WebSocket (推送 ha_event/notification/vm_status) | axum WS + JWT |
| 跨用户 skill/memory 同步 | sqlx + alembic-style migrations |

## 部署

- 单独 `studioarona-center` Rust 二进制
- 监听 `:9000` (HTTP API) + `:9001` (WebSocket)
- systemd unit 开机自启
- 用 docker PG + Redis (跟桌面 app 共享同一份数据)

## 跟 desktop-core 边界

- **desktop-core** 是个人的: 跑在用户终端, 单 user_id, 离线可用
- **center** 是工作室的: 跑在 LAN server, 多 user_id, 永远在线
- desktop-core 通过 `center-client` (Rust crate) 调 center HTTP API
- center 不依赖 desktop-core, 它独立 axum 服务
