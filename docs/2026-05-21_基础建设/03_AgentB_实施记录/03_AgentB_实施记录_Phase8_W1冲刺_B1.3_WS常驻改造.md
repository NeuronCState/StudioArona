# Phase 8 · W1 冲刺 B1.3 — WebSocket 常驻改造（技术探索）

> **日期**：2026-05-21
> **任务**：B1.3 — OpenClaw 子进程 spawn 改常驻 Gateway 复用
> **目标**：TTFT p95 < 1500ms

## 1. 当前问题

Bridge 对每条消息 spawn `openclaw agent --json` 子进程：
- 进程启动 (~1.5s) + 模块加载 (~0.5s) + Gateway 连接认证 (~0.3s) = **~2.3s 冷启动**
- TTFT 目标 1500ms，子进程开销已超标

## 2. 探索：WebSocket 直连 Gateway

### 协议逆向
通过分析 OpenClaw 2026.5.18 bundled 代码 (`client-CYDoDi4S.js`)：
- WebSocket 连接 → Gateway 推送 `connect.challenge` 事件（含 nonce）
- 客户端发送 `{"type":"req","method":"connect","params":{minProtocol:4, maxProtocol:4, client:{id, mode, ...}, auth:{token}}}` 
- Gateway 验证后建立会话
- 后续通过 `{"type":"req","method":"...","params":{...}}` 调用 RPC

### 结果

| 客户端 ID | 结果 |
|-----------|------|
| `agent-bridge` (自定义) | ❌ 不在允许列表 |
| `gateway-client` | ✅ auth 通过 → ❌ RPC: "device identity required" |
| `cli` | ✅ auth 通过 → ❌ RPC: "device identity required" |
| `openclaw-control-ui` | ✅ auth 通过 → ❌ RPC: "control ui requires device identity" |
| `webchat` | ✅ auth 通过 → ❌ RPC: "device identity required" |

### 结论
**所有客户端类型都需要 device identity（Ed25519 密钥对 + nonce 签名）**。WebSocket 认证层已打通，但 RPC 调用需要 device identity。

### 待完成
- 生成 Ed25519 密钥对
- 存储到 `services/agent/.device-identity.json`
- 在 connect params 中附加 `device: {id, publicKey, signature, signedAt, nonce}`
- 实现 `signDevicePayload(privateKeyPem, payload)` 

预计 W2 联调前完成。

## 3. 临时方案

保持子进程 spawn 方式，接受 TTFT < 3000ms 作为 v0.1.0 临时门槛（见冲刺计划 R1 回退方案）。

## 4. 已产出代码

`services/agent/bridge/ws-gateway.js` — GatewayClient class：
- connect() / request() / chat() 方法
- 自动重连
- Token-based auth
- 单例模式

待 device identity 实现后即可启用。
