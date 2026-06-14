#!/usr/bin/env bash
# install-deps.sh — 跨平台自动安装（thin shim → infra/scripts/install_deps.py）
#
# 这是给旧 README/链接留的兼容入口。
# 新代码请用 `./run.sh install` —— 内部走 Python install_deps.py
# 覆盖范围更全：uv / docker / hermes CLI / 依赖 sync / models。
#
# 已装就跳过。

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec "$ROOT/run.sh" install "$@"
