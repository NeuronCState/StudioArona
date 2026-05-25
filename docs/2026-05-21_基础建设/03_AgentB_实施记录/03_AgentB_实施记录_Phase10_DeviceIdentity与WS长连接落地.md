# Phase 10 · Device Identity 与 WebSocket 长连接落地

> **日期**：2026-05-21
> **任务**：完成 OpenClaw device identity（Ed25519 + nonce 签名），让 B1.3 真落地

## 1. Device Identity 实现

### 密钥体系（从 OpenClaw 源码逆向）

```
Ed25519 密钥对
├── SPKI 前缀: 302a300506032b6570032100 (12 bytes)
├── 公钥:     SPKI 前缀 + 32 bytes raw
├── 私钥:     PKCS8 格式 (48 bytes prefix)
└── Device ID: SHA256(raw public key 32 bytes) → hex
```

### 签名流程

1. `buildDeviceAuthPayload`: 构建签名原文 = `v3|deviceId|clientId|mode|role|scopes|signedAtMs|token|nonce|platform|deviceFamily`
2. `sign`: Ed25519 sign(payload) → base64url 编码
3. 发送 `device: {id, publicKey, signature, signedAt, nonce}` 在 connect params 中

### 实现位置
`services/agent/bridge/ws-gateway.js` — 完整实现，包含：
- Ed25519 密钥对加载（复用 OpenClaw CLI 的 device identity）
- `signDevicePayload()` / `publicKeyRawBase64UrlFromPem()`
- GatewayClient class: connect → challenge → sign → RPC

## 2. WebSocket 连接测试结果

| 阶段 | 结果 | 详情 |
|------|------|------|
| WS 连接 | ✅ | 连接到 `ws://127.0.0.1:18789/` |
| Challenge 接收 | ✅ | 收到 `connect.challenge` + nonce |
| 签名计算 | ✅ | Ed25519 签名正确生成 |
| Connect 发送 | ✅ | 发送 `method: "connect"` RPC |
| Gateway 验证 | ❌ | `1002 protocol mismatch` |

### 错误分析

`1002 protocol mismatch` 在 Gateway 端发生在：
- `formatProtocolMismatchMessage()` 检查 minProtocol/maxProtocol 与 Gateway 预期版本的匹配
- 我们的 `minProtocol: 4, maxProtocol: 4` 与 OpenClaw CLI 参数一致
- 但 Gateway 仍拒绝连接

可能原因（待排查）：
1. Gateway 的 launchd daemon 与我们手动启动的 Gateway 使用不同配置
2. `client.id` 和 `client.mode` 组合需要特定权限
3. 需要 `gateway.remote.token` 或特定的 origin 检查

## 3. 当前方案：子进程 + 预热

```
Bridge 启动 → agentPool.warmup() → 预 spawn `openclaw agent .`
                                          ↓
请求到达 → spawn `openclaw agent --message "xxx"` → ~1.5s 启动 + ~5-15s LLM
```

### 性能特征

- spawn 开销: ~1.5s（pNpm + Node + module loading）
- GW auth: ~0.3s（CLI 内部 WebSocket auth）
- LLM TTFT: ~2-8s（MiniMax-M2.7 云 API）
- **总 TTFT p95: ~3-10s**

→ 不满足冲刺目标 < 1500ms
→ 接受冲刺计划 R1 回退: v0.1.0 临时门槛 < 3000ms

## 4. W3 冲刺优化路径

1. **WebSocket 长连接**（优先）：补完 device identity 验证 → 消除 1.5s spawn + 0.3s auth 开销 → TTFT 接近纯 LLM 延迟
2. **Gateway 配置调优**：确认 gateway.remote.token 策略
3. **MiniMax high-speed 模式**：如可用，LLM TTFT 更短

## 5. 代码交付

```
services/agent/bridge/
├── ws-gateway.js           # WebSocket 客户端（device identity 完整实现）
├── ws-gateway-test.js      # 连接测试
├── ws-probe.js             # 协议探测
├── ws-debug.js             # 详细调试
├── agent-pool.js           # 进程池预热
└── server.js               # 已集成 agent-pool warmup
```

### .device-identity.json
存储在 `services/agent/.device-identity.json`（Ed25519 密钥对，不入 Git）。
当前版本复用 `~/.openclaw/identity/device.json`（OpenClaw CLI 的 identity）。

## 6. 下一步
- W2 联调日 (5/30): 启用 WS 长连接（需完成 device identity Gateway 验证）
- W4 性能日 (6/13): 性能基线达标
