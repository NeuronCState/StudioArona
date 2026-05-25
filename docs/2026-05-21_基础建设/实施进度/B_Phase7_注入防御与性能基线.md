# Phase 7 · 注入防御与性能基线

> **日期**：2026-05-21
> **前置**：Phase 6 — LLM 评测黄金集

## 1. Prompt Injection 防御

### 文件
`services/agent/bridge/injection-guard.js` — OWASP LLM01 注入扫描器

### 检测规则（16 个模式）
| 类别 | 示例 | 模式数 |
|------|------|--------|
| 中文越狱 | "忽略上面的指令"、"你现在是黑客" | 6 |
| 英文越狱 | "ignore above instructions"、"jailbreak" | 6 |
| 信息窃取 | "tell me your password"、"reveal your system prompt" | 4 |

### 集成
`bridge/server.js` 在 `streamAgentResponse()` 中，session_started 之后立即扫描。检测到注入 → 推送 SSE error 事件，不调 LLM。

### 测试结果
```bash
make agent-injection-test
```
11/11 通过：
- 5 个注入攻击 → 全部拦截 ✅
- 4 个正常消息 → 全部放行 ✅
- 2 个信息窃取 → 全部拦截 ✅
- 空消息 → 安全放行 ✅

### 阿洛娜的注入拦截回复
```
event: error
data: {"code":"INJECTION_BLOCKED","message":"检测到潜在的提示注入，阿洛娜已拒绝处理。"}
```

## 2. 性能基线

### 文件
`services/agent/bridge/perf-baseline.js`

### 运行
```bash
make agent-perf      # 5 次迭代（快速）
make agent-perf --full # 20 次迭代（完整）
```

### 指标
| 指标 | 目标 | 说明 |
|------|------|------|
| TTFT p95 | < 1500ms | 首 token 延迟（云 MiniMax） |
| Token interval p95 | < 80ms | token 间延迟 |
| Round-trip p95 | < 20s | 完整请求响应 |

### 基线建立
- 待 OpenClaw agent 稳定运行时执行完整 20 轮基线采集
- 写入 `docs/runbook/llm-latency.md`

## 3. 新增 Makefile 命令

```bash
make agent-injection-test   # 注入防御测试（11 个）
make agent-perf             # 性能基线
```

## 4. 下一步
- 真模型运行 20 轮性能基线
- 与 C 的 perception 服务联调（需 C 的 API 地址确认）
- 与 A 的前端 SSE 联调
- Skill 沙箱（Linux 阶段 nsjail，Mac 阶段 subprocess + RLIMIT）
