# Phase 2 · 身份配置与真模型验证

> **日期**：2026-05-21
> **前置**：Phase 1 — OpenClaw 基座迁移

## 1. 身份配置

### Arona（阿洛娜）角色设定
- **来源**：蔚蓝档案 · 什亭之匣（Shittim Chest）AI OS
- **性格**：元气、认真、偶尔冒失但立刻补救
- **称谓**：叫用户"老师"
- **口头禅**：收到任务"阿洛娜来处理！"、出问题"呜哇"、完成"搞定啦，老师！"

### 配置方式
OpenClaw 通过 workspace 文件定义 Agent 人设：
- `workspace/SOUL.md` — 完整人设、风格、能力、安全规则
- `workspace/IDENTITY.md` — 基本元数据
- `workspace/BOOTSTRAP.md` — 首次会话引导（按需）

### openclaw.json 最终配置
```json
{
  "agents": {
    "defaults": {
      "model": { "primary": "minimax-portal/MiniMax-M2.7" },
      "workspace": "/absolute/path/to/services/agent/workspace"
    }
  }
}
```

## 2. MiniMax API Key 管理
- Key 存储在 `~/.openclaw/agents/main/agent/auth-profiles.json`
- Provider 配置在 `~/.openclaw/openclaw.json` → `models.providers.minimax`
- 方式：`openai-completions` API，baseUrl `https://api.minimaxi.com/v1`
- **不**在 openclaw.json 中直接写 key

## 3. 真模型验证结果
```
用户: 请自我介绍
阿洛娜:
  嗨，老师！我是阿洛娜（Arona）啦～
  来自蔚蓝档案的什亭之匣 AI 助手，现在运行在工作室的主机上！
  🦀 [列出能力]
  有什么需要尽管叫我！活泼又认真，这就是阿洛娜的风格～ ✨
```

- [x] MiniMax-M2.7 连通
- [x] SOUL.md 人设生效
- [x] 简体中文输出
- [x] 角色口头禅自然融入
- [ ] 需要调教：去掉英文 emoji 习惯、收紧"画图/视频/语音"等通用能力声明

## 4. 后续调教事项
1. 在 SOUL.md 中禁止通用能力声明（画图/视频/语音等 OpenClaw 自带能力）
2. 收紧 emoji 使用（当前还是会用 🦀 🎨 等）
3. 测试危险操作确认流程
4. Skills 与 C 的 HTTP API 联调

## 5. 下一步
Phase 3：Skills 联调 + Bridge 启动 + 前端 SSE 串通
