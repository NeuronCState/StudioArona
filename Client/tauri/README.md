# Client/tauri/

**v3 桌面壳** (Phase 2, 2 周) — 跨平台打包 React 前端 + Rust 后端。

## 职责

- 加载 `Client/web/dist/` 静态产物 (Vite prod build)
- 桥接前端 ↔ `Server/rust/desktop-core` (Tauri commands 内部 RPC)
- 系统托盘 + 自动启动
- 跨平台通知 + 快捷键
- 自动更新 (Tauri updater)

## 跨平台打包

- **macOS**: `.dmg` (双击拖入 Applications)
- **Windows**: `.msi` (双击安装)
- **Linux**: `.AppImage` + `.deb` (chmod +x 或 apt install)

## 跟 Server/center 关系

- Tauri 启动后, desktop-core 探测 center
- 探测到 → 连接, 激活协作 UI
- 没探测到 → degraded mode (个人智能助手 + 本地存储)
- 反向 WebSocket (Phase 3) 接收 center 推送 (ha_event/notification/vm_status)
