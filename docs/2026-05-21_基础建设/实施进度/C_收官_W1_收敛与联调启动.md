# C 收官冲刺 W1 — 收敛与联调启动（2026-05-21）

> **阶段**：Mac 收官冲刺 W1（5/21–5/27）
> **输入**：`05_Mac阶段收官冲刺计划.md` §4.3
> **状态**：✅ C1.1–C1.4 完成

---

## C1.1 测试目录迁移 → tests/C/

**操作**：删除 `services/perception/tests/`，迁移所有测试到 `tests/C/`。

| 旧路径 | 新路径 | 文件数 |
|--------|--------|--------|
| `services/perception/tests/unit/` | `tests/C/unit/` | 20 |
| `services/perception/tests/integration/` | `tests/C/integration/` | 4 |
| `services/perception/tests/perf/` | `tests/C/perf/` | 2 |
| `services/perception/tests/conftest.py` | `tests/C/conftest.py` | 1 |
| `services/perception/tests/__init__.py` | `tests/C/__init__.py` | 1 |

**路径修复**：4 个 Skill 测试文件的 `PROJECT_ROOT` 从 5 层 `.parent` 改为 4 层（`tests/C/unit/` → 项目根 = 4 层，旧 `services/perception/tests/unit/` → 项目根 = 5 层）

**pythonpath 冲突解决**：`services/api-gateway` 和 `services/perception` 都有 `app` 包。不在全局 `pythonpath` 中同时列出两者，而是在 `tests/C/conftest.py` 中通过 `sys.path.insert(0, ...)` 注入 perception 路径。

**结果**：144 测试全绿，`services/perception/tests/` 已删除。

---

## C1.2 CRC16 去重 — face_loop.py → protocol.py

**发现**：`face_loop.py` 的 `_send_serial()` 方法手动拼接帧 + `_crc16()` 静态方法，与 `app/core/serial/protocol.py` 中的 `encode_target()` 和 `crc16_ccitt()` 完全重复。

**修复**：`_send_serial()` 改为直接调用 `encode_target(state.dx, state.dy, state.depth_mm)`，删除重复的 `_crc16` 静态方法和手动帧拼接。

---

## C1.3 清理 vm/upload/ 空壳

`packages/skills/vm/upload/` 仅含 `.gitkeep`，`vm/upload_archive/` 是完整实现。已删除 `packages/skills/vm/upload/`。

---

## C1.4 WS publisher 真连 D 的 /internal/events/publish

### 调研 D 接口现状

D 的 `/internal/events/publish` 端点：
- **存在**：POST `/internal/events/publish`，body `{user_id, event}`
- **安全**：仅允许 localhost 请求
- **缺失**：无 broadcast 端点（`hub.broadcast()` 存在但未暴露）

**阻塞项（已解决）**：
1. D 缺少 `/internal/events/broadcast` 端点 ← **已为 D 新增**
2. C 的 EventPublisher 仅写 log，未实际 HTTP POST ← **已修复**

### 实现

**D 侧**（`services/api-gateway/app/internal/events.py`）：
- 新增 `POST /internal/events/broadcast`：接受 `{event}`，广播到所有已连接 WS 客户端
- 原 `/internal/events/publish` 支持 `user_id: "*"` 触发广播

**C 侧**（`services/perception/app/ws/publisher.py`）：
- `EventPublisher` 改用 `httpx.AsyncClient` 实际 POST 到 D 的 gateway
- `wake` → `publish_to_user(user_id, ...)` → `POST /internal/events/publish`
- `face_track` / `leave` / `metrics_update` / `screen_changed` → `publish(...)` → `POST /internal/events/broadcast`
- 新增 `gateway_url` 配置项（env: `PERCEPTION_GATEWAY_URL`，默认 `http://localhost:8080`）
- 连接失败/超时不崩溃，记录 warning 日志

**测试**：新增 3 个 HTTP 集成测试（mock httpx client），验证正确调用 publish/broadcast 端点。总计 11 个 publisher 测试。

---

## 完成度

| 任务 | 状态 | 测试 |
|------|------|------|
| C1.1 测试迁移 | ✅ | 144/144 |
| C1.2 CRC16 去重 | ✅ | face_loop 回归 |
| C1.3 清理 upload 空壳 | ✅ | grep 确认无引用 |
| C1.4 WS publisher 真连 | ✅ | 11 个 publisher 测试 |

**总计**：4/4 任务完成，144 测试全绿。
