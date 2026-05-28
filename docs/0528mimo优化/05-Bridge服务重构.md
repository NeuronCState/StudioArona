# 05 — Bridge 服务重构

> 分支: `b/bridge-refactor`
> 预估: 8h | 角色: B | 依赖: 01-清理重复文件

## 目标

修复 bridge server 的错误处理、内存泄漏、TTS bug、代码质量问题。

## 任务清单

### 5.1 修复 TTS 双重触发 bug [HIGH]

**文件**: `services/agent/bridge/server.js:243`

```javascript
// 旧 — 对用户消息触发 TTS（错误）
ttsConvert(augmentedMessage).then(...)

// 删除此行，仅保留 line 308 对 AI 回复的 TTS
```

### 5.2 修复 TTS Promise 无 catch [CRITICAL]

**文件**: `services/agent/bridge/server.js:308`

```javascript
// 旧
ttsConvert(fullText).then(...)

// 新
ttsConvert(fullText)
  .then((result) => { /* broadcast */ })
  .catch((err) => console.error("[tts] TTS generation failed:", err));
```

### 5.3 添加路由 try/catch [HIGH]

**文件**: `services/agent/bridge/server.js`

为以下路由添加 try/catch：
- `searchMessages` (line 698)
- `handlePresenceEvent` (line 708)
- `adoptGuestHistory` (line 728)
- `createSession` (line 420)

```javascript
// 模式
try {
  const result = await someOperation();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result));
} catch (err) {
  console.error("[bridge] Route error:", err);
  res.writeHead(500, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Internal server error" }));
}
```

### 5.4 修复内存泄漏 [HIGH]

**文件**: `services/agent/bridge/server.js`

1. **preferences Map** — 添加 TTL 驱逐或 LRU 限制：
```javascript
// 方案 A: 定时清理
setInterval(() => {
  // preferences 没有时间戳，改为在写入时记录时间
}, 30 * 60 * 1000);

// 方案 B: 改用 LRU Cache
import { LRUCache } from 'lru-cache';
const preferences = new LRUCache({ max: 1000, ttl: 30 * 60 * 1000 });
```

2. **message_ids 数组** — 限制最大长度：
```javascript
session.message_ids.push(msgId);
if (session.message_ids.length > 100) {
  session.message_ids = session.message_ids.slice(-50);
}
```

3. **KNOWN_LINKS Map** — 添加定期清理：
```javascript
// web-watcher.js
setInterval(() => {
  // 清理超过 24 小时的条目
  for (const [key, value] of KNOWN_LINKS) {
    if (Date.now() - value.seenAt > 24 * 60 * 60 * 1000) {
      KNOWN_LINKS.delete(key);
    }
  }
}, 60 * 60 * 1000);
```

4. **guestUsers Map** — 添加定期清理：
```javascript
// voice-flow.js
setInterval(() => {
  const now = Date.now();
  for (const [id, user] of guestUsers) {
    if (now - user.created_at > 15 * 60 * 1000) {
      guestUsers.delete(id);
    }
  }
}, 5 * 60 * 1000);
```

### 5.5 合并重复的 readBody 函数 [HIGH]

**文件**: `services/agent/bridge/server.js`

删除 `readBody()` 闭包（line 403），统一使用 `readJsonBody(req)`（line 373）。

### 5.6 修复 error_handler 丢 traceback [MEDIUM]

**文件**: `services/api-gateway/app/middleware/error_handler.py`

```python
# 旧
except Exception:
    trace_id = uuid.uuid4().hex[:8]
    return JSONResponse(...)

# 新
except Exception as exc:
    trace_id = uuid.uuid4().hex[:8]
    logger.exception("Unhandled error", trace_id=trace_id, error=str(exc))
    return JSONResponse(...)
```

### 5.7 修复 structlog 配置 [MEDIUM]

**文件**: `services/api-gateway/app/main.py`

```python
# 旧
structlog.dev.ConsoleRenderer() if True else structlog.processors.JSONRenderer()

# 新
structlog.dev.ConsoleRenderer() if settings.ENVIRONMENT == "development" else structlog.processors.JSONRenderer()
```

### 5.8 清理前端 debug console.log [MEDIUM]

**文件**:
- `apps/web/src/pages/studio/StudioHomePage.tsx:480,498`
- `apps/web/src/hooks/useSpeechRecognition.ts:55,57`

移除或降级为 `console.debug`。

### 5.9 固定 openclaw 版本 [HIGH]

**文件**: `services/agent/package.json`

```json
// 旧
"openclaw": "latest"

// 新 — 先查当前安装的版本
// npm ls openclaw 或 pnpm ls openclaw
// 然后固定
"openclaw": "x.y.z"
```

### 5.10 添加 openclaw 更新检查端点

**文件**: `services/agent/bridge/server.js`

```javascript
// GET /api/system/openclaw-version
// 返回 { installed: "x.y.z", latest: "a.b.c", updateAvailable: true/false }
// 通过 npm view openclaw version 获取最新版本
```

### 5.11 添加请求体大小限制 [LOW]

**文件**: `services/agent/bridge/server.js`

在 `readJsonBody` 中添加：
```javascript
const MAX_BODY_SIZE = 1024 * 1024; // 1MB
if (chunks.reduce((acc, c) => acc + c.length, 0) > MAX_BODY_SIZE) {
  res.writeHead(413, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Request body too large" }));
  return;
}
```

## 验证步骤

1. `pnpm --filter agent install` — 依赖安装成功
2. `node services/agent/bridge/server.js` — 启动无报错
3. 手动测试 TTS — 只对 AI 回复触发，不对用户消息触发
4. 手动测试错误处理 — 发送无效请求返回 500 而非崩溃
5. `node services/agent/bridge/injection-test.js` — 注入测试通过

## Commit

```
fix(agent): fix TTS bug, add error handling, fix memory leaks

- Fix TTS double-trigger: remove TTS on user message, keep only on AI response
- Add .catch() to TTS Promise to prevent unhandled rejection crash
- Add try/catch to 4 routes missing error handling
- Fix memory leaks: add TTL to preferences Map, limit message_ids array,
  add periodic cleanup to KNOWN_LINKS and guestUsers
- Merge duplicate readBody/readJsonBody functions
- Fix error_handler to log actual exceptions
- Fix structlog config to use JSONRenderer in production
- Pin openclaw to specific version
- Add openclaw update check endpoint
- Add request body size limit (1MB)
```
