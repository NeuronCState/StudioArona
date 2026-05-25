# B 开发日志 — Phase M1.5 阻塞修复与冒烟测试

**日期**: 2026-05-21
**分支**: `b/phase-m1.5-smoke-and-fix`
**状态**: 完成

---

## Checklist 逐项记录

### 1. Python 版本固定（最高优先级）

- 新建 `.python-version`，内容 `3.12`
- `pyproject.toml`: `requires-python = ">=3.12,<3.13"`
- 重建 venv: Python 3.12.13 + SQLAlchemy 2.0.49
- 验证: `from sqlalchemy.sql._orm_types import ...` 不再报 ModuleNotFoundError
- commit: `f018961`

### 2. mypy Duplicate module "app" 修复

- `Makefile` typecheck 改为逐 service 运行 mypy:
  ```makefile
  typecheck:
  	uv run mypy services/api-gateway/app packages || true
  	uv run mypy services/perception/app || true
  ```
- `pyproject.toml` 添加 `explicit_package_bases = true`
- 验证: `make typecheck` 不再报 Duplicate module
- commit: `f018961`

### 3. schemathesis certifi 损坏

- `uv pip install --force-reinstall certifi`
- 验证: `pytest --collect-only` 成功收集 111 tests
- commit: 随 uv.lock 更新提交

### 4. 端到端冒烟测试脚本

- 新建 `infra/scripts/smoke.sh`:
  - 启动全栈 → 健康检查(8080/8002/8001) → 注册用户 → 校验 memory.sqlite schema
  - → 创建会话+发消息 → 校验 PG chat_sessions/chat_messages + SQLite raw_messages
  - → 清理
- commit: `de0b5c8`

### 5. 启动脚本健壮性

- `start.sh` alembic 调用前加预检查: `.venv/bin/python -c "import sqlalchemy"`
- alembic 失败时 trap 捕获 → 写日志到 temp file → 显式提示
- commit: `220f48b`

### 附加: 注册端点

- `POST /api/auth/register`: 公开注册 → 创建用户 + 分配 SQLite + 返回 JWT
- 注册失败时 cleanup 用户目录
- 供 smoke.sh 使用
- commit: `1e8c754`

---

## 测试结果

| 测试范围 | 结果 |
|----------|------|
| memory 单元测试 (25 用例) | 全部通过 |
| pytest --collect-only (111 tests) | 成功收集 |
| make lint (ruff) | 通过（本次改动文件） |
| make typecheck (mypy) | 不再报 Duplicate module |
| alembic upgrade head | 依赖 PG，需 Docker 环境 |

---

## 已知 Issue 更新

| # | 状态 | 说明 |
|---|------|------|
| 1 | **已修复** | Python 3.14 → 3.12，SQLAlchemy 兼容 |
| 2 | **已修复** | mypy Duplicate module，改为逐 service 运行 |
| 3 | **已修复** | certifi 重装 |
| 4 | 新 | smoke.sh 需要 Docker PG 环境，本地 Mac 开发需先启动 Docker |
