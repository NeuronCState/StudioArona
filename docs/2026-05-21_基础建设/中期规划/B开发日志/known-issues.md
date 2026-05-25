# B 开发已知 Issue 列表

> 最后更新: 2026-05-21 (Phase M1.5)

---

## Issue #1: mypy Duplicate module "app" ✅ 已修复

- **严重程度**: 中 → 已修复 (M1.5)
- **修复**: Makefile typecheck 改为逐 service 运行 mypy
- **commit**: `f018961`

---

## Issue #2: SQLAlchemy 与 Python 3.14 不兼容 ✅ 已修复

- **严重程度**: 高 → 已修复 (M1.5)
- **修复**: `.python-version` + `requires-python = ">=3.12,<3.13"`
- **commit**: `f018961`

---

## Issue #3: schemathesis certifi 导入失败 ✅ 已修复

- **严重程度**: 低 → 已修复 (M1.5)
- **修复**: `uv pip install --force-reinstall certifi`
- **commit**: `04347b6`

---

## Issue #4: .gitignore models/ 误匹配 (已修复)

- **严重程度**: 已修复
- **文件**: `.gitignore` line 58
- **现象**: `services/api-gateway/app/models/` 目录被 gitignore
- **原因**: `models/` 规则本意是忽略 AI model 文件 (`/models/`)，但匹配了所有路径中的 models 目录
- **修复**: 改为 `/models/` (仅根目录)
- **commit**: `c402816`
