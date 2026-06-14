# Client/

用户终端上跑的代码 — 前端 + 桌面壳。

```
Client/
├── web/     当前 React 18K + Vite SPA
│           apps/web 的搬家目标 (渐进迁移, 不要急)
└── tauri/   v3 Rust 桌面壳 (Phase 2)
            Tauri 包装 Vite 编译产物, 跨平台 .dmg/.msi/.AppImage
```

## 跟 Server 的边界

- **永远只走 HTTP/REST/WebSocket**, 不知道 backend 是 Python 还是 Rust
- 配置文件 / 静态资源通过 Tauri 桥接 (Phase 2) 拿到
- 跨用户协作能力通过 `Server/center/` 的反向 WebSocket 推过来 (Phase 3)

## 迁移计划

1. **现在**: 空目录 + 文档
2. **后续**: `apps/web/` 软链到 `Client/web/` (或 git mv)
3. **v3 Phase 2**: `Client/tauri/` 启用, Tauri 加载 `Client/web/dist/`
4. **v3 Phase 3**: Tauri 启用反向 WebSocket 监听中心事件
