# Phase7：ACP 持久连接 + 生产化

> **起草日**：2026-05-23
> **Phase6 产物**：代码整理完成，全链路可对话，TTFT 3-6s
> **目标**：ACP WebSocket 持久连接，消除 spawn 开销，统一全功能路径

---

## 0. 起点快照（Phase6 结束）

### 已完成的优化

| 优化项 | 效果 |
|--------|------|
| API Gateway SSE 流式修复 | 去 15s 缓冲延迟 |
| Gateway 版本对齐 + 配置修正 | 去 protocol mismatch → embedded 回退 |
| MiniMax prompt cache 预热 | 16.6s → 2.5s（冷启动问题解决） |
| 精简 system prompt | TOOLS.md 移除，2151 → 1233 字符 |
| reasoning 禁用 + think 过滤 | 去 5-7s 推理时间 |
| 词级 SSE 流式输出 | 去 2s 逐字延迟 |
| 直接 MiniMax API 快速路径 | 普通对话 ~3s |
| 沙盒文件清理 | 14 个文件删除 |
| Zustand 场景状态管理 | stores/scene.ts |
| 场景配置系统 | scenes/scene-config.ts |
| TTS 集成 | Minimax TTS via OpenClaw |
| 类型完善 | types/live2d.d.ts, types/three.d.ts |
| 前端 StudioHome 接真实 SSE | 替换硬编码 mock 回复 |

### 当前性能

| 路径 | TTFT | 能力 |
|------|------|------|
| MiniMax 直连 | ~2.9s | 纯对话（SOUL + IDENTITY） |
| OpenClaw pool | ~4.5s | 全功能（工具/技能/workspace/TOOLS.md） |

### 当前架构瓶颈

```
Bridge ──spawn──> openclaw agent ──WebSocket──> Gateway ──HTTP──> MiniMax
        2.9s                   1s                 2.5s
```

每次请求 spawn 新进程是唯一瓶颈。ACP 持久连接可消除这 3s。

---

## 1. ACP 持久连接方案

### 1.1 目标

```
Bridge ──持久 WebSocket──> Gateway ──HTTP──> MiniMax
        (启动时连接一次)               2.5s
```

TTFT 目标：**< 3s**（全功能路径，含 TOOLS.md + 技能系统）

### 1.2 技术路线

OpenClaw Gateway 的 ACP 协议使用 **challenge-response 认证**：

```
Client → Gateway:  WebSocket 连接
Gateway → Client:  connect.challenge { nonce, ts }
Client → Gateway:  connect.response { nonce, response }
Gateway → Client:  hello-ok
Client → Gateway:  agent { message, sessionId, thinking }
Gateway → Client:  agent stream=assistant { text }
Gateway → Client:  agent stream=lifecycle phase=end
```

**Challenge-response 算法**（需从 OpenClaw 源码提取）：
- 已知：`auth=token` 模式，token 在配置中
- 推测：`response = HMAC-SHA256(token, nonce + ts)` 或类似签名
- 验证：当前 `createHmac('sha256', token).update(nonce+ts)` 返回 1008

### 1.3 实施步骤

| 步骤 | 任务 | 工作量 |
|------|------|--------|
| 1 | 提取 OpenClaw ACP challenge-response 签名算法 | 0.5d |
| 2 | 实现 `acp-client.js` WebSocket 客户端（auth + agent 请求） | 1d |
| 3 | 集成到 `streamAgentResponse`：优先 ACP，回退 agentPool | 0.5d |
| 4 | 压力测试 + 断线重连 | 0.5d |
| 5 | TTS 路径也改用 ACP（`infer tts convert` → ACP tts 方法） | 0.5d |

**总计**：~3 人天

### 1.4 风险与回退

| 风险 | 应对 |
|------|------|
| ACP 协议签名算法无法提取 | 使用 Wireshark 抓包对比 CLI 的 WebSocket 流量 |
| Gateway 不支持长连接复用 | 使用 session 保持 + KeepAlive ping |
| 二进制帧（protobuf） | Gateway 日志显示 JSON 事件，大概率支持 JSON 模式 |

---

## 2. 生产化清单

### 2.1 稳定性

- [ ] Bridge 进程守护（launchd 或 systemd）
- [ ] Gateway 进程守护（已在 launchd，需更新 plist 到 v2026.5.18）
- [ ] 健康检查端点（`/api/health`）
- [ ] 优雅关闭（SIGTERM → 断开 WS → 关闭 PG pool）
- [ ] 内存泄漏监控（agent pool worker 生命周期）

### 2.2 性能

- [ ] ACP 持久连接落地（见 §1）
- [ ] MiniMax prompt cache 定期刷新（避免 cache 过期）
- [ ] SSE keepalive 间隔优化（当前 15s）
- [ ] PG 连接池调优（当前 max=5，考虑增加到 10）

### 2.3 安全

- [ ] MINIMAX_API_KEY 不落盘（用环境变量或 secrets manager）
- [ ] Gateway token 轮换机制
- [ ] CSRF 中间件确认无绕过
- [ ] SSE 流注入防护

### 2.4 运维

- [ ] 日志聚合（bridge + gateway + api-gateway）
- [ ] 错误告警（TTFT > 10s、Gateway 断连、MiniMax 429）
- [ ] 部署脚本适配（`.env.production` 模板更新）
- [ ] Runbook 更新（故障排查流程）

---

## 3. 功能增强（可选）

### 3.1 Memory 完整化

- [ ] Per-user SQLite 路径修正验证（已改为 `/internal/memory/entries`）
- [ ] 长期记忆写入链路（summarizer pipeline → PG + SQLite）
- [ ] 跨会话记忆召回测试

### 3.2 TTS 流式化

- [ ] TTS 生成与 token 流同步（当前先流 token 后异步 TTS）
- [ ] 前端 AudioContext 替代 `<Audio>` 元素（更精确的播放控制）
- [ ] Live2D lip-sync 参数驱动（从 TTS 音频提取音素时间戳）

### 3.3 前端体验

- [ ] StudioHomePage 对话窗口优化（滚动、loading 状态）
- [ ] QuickChatBar 与 ChatInput 组件统一
- [ ] 错误提示友好化（"阿洛娜暂时无法回复" 替代技术错误信息）

---

## 4. 时间线

```
Day 1-2: ACP 签名算法提取 + acp-client.js 实现
Day 3:   集成测试 + 断线重连
Day 4:   生产化清单（进程守护、日志、告警）
Day 5:   压测 + Runbook + 冻结
```

---

## 5. 修订记录

| 日期 | 修订 |
|------|------|
| 2026-05-23 | 初稿 |
