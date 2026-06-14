#!/usr/bin/env bash
# StudioArona 跨平台启动脚本（dispatcher 模式）
# 用法:
#   ./run.sh start                          # 启动整套后端 (PG/Redis/API/Bridge/Vite/LLM Gateway)
#   ./run.sh install                        # 跨平台 bootstrap（uv/docker/hermes/models）
#   ./run.sh python xxx.py [args]           # 跑任意 Python 脚本
#   ./run.sh python -c "print(1)"           # 跑内联 Python
#   ./run.sh pytest [args]                  # 跑 pytest
#   ./run.sh pip install ...                # 跑 pip
#   ./run.sh bash                           # 交互 bash（PATH 里有 venv）
#   ./run.sh make <target>                  # 跑 make
#   ./run.sh --version                      # python --version
#
# 行为：
#   1. 检测当前 OS/arch，选择 vendor/python/<plat>/ 下的 Python 解释器
#   2. 把 .venv/bin/python 链接到当前平台的解释器
#   3. 如果 .venv 下没有 site-packages（首次跑），自动 uv sync 装依赖
#   4. 根据第一个参数路由到对应命令；其他原样透传

set -e

# 解析项目根目录
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检测平台
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS:$ARCH" in
  Darwin:arm64)   PLAT=darwin-arm64; PY_BIN=bin/python3.12 ;;
  Darwin:x86_64)  PLAT=darwin-x64;   PY_BIN=bin/python3.12 ;;
  Linux:x86_64)   PLAT=linux-x64;    PY_BIN=bin/python3.12 ;;
  Linux:aarch64)  PLAT=linux-arm64;  PY_BIN=bin/python3.12 ;;
  *) echo "[run.sh] Unsupported platform: $OS $ARCH" >&2
     echo "[run.sh] Supported: darwin-arm64, darwin-x86_64, linux-x86_64, linux-aarch64" >&2
     exit 1 ;;
esac

PY_INTERP="$ROOT/vendor/python/$PLAT/$PY_BIN"
if [ ! -x "$PY_INTERP" ]; then
  echo "[run.sh] Missing interpreter for $PLAT at $PY_INTERP" >&2
  exit 1
fi

# 链接 .venv/bin/python 到当前平台
mkdir -p "$ROOT/.venv/bin"
ln -sfn "../../vendor/python/$PLAT/$PY_BIN" "$ROOT/.venv/bin/python"
ln -sfn "python" "$ROOT/.venv/bin/python3"

# 首次跑自动 uv sync
SITE_DIR="$ROOT/.venv/lib/python3.12/site-packages"
NEED_SYNC=0
if [ ! -d "$SITE_DIR" ]; then
  NEED_SYNC=1
elif [ -z "$(ls -A "$SITE_DIR" 2>/dev/null)" ]; then
  NEED_SYNC=1
fi

if [ "$NEED_SYNC" = "1" ]; then
  echo "[run.sh] First run on $PLAT — syncing dependencies..." >&2
  if ! command -v uv >/dev/null 2>&1; then
    echo "[run.sh] 'uv' not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
    exit 1
  fi
  cd "$ROOT" && uv sync
fi

# ─── 子命令路由 ───────────────────────────────────────────────────
# 把常见命令转发到 venv 里的对应工具，避免用户先 source .venv/bin/activate
# 也支持 `start` 走业务启动器。
case "${1:-}" in
  "")
    # 无参数：提示用法
    echo "用法: ./run.sh {start|install|python|pytest|pip|bash|make|hermes|...} [args]"
    echo "  详见 run.sh 顶部注释"
    exit 0
    ;;
  start)
    # 业务启动器（PG/Redis/API/Bridge/Vite/LLM Gateway）
    shift
    exec "$ROOT/.venv/bin/python" "$ROOT/infra/scripts/start.py" "$@"
    ;;
  install)
    # 跨平台 bootstrap（uv/docker/hermes/deps/models）
    shift
    exec "$ROOT/.venv/bin/python" "$ROOT/infra/scripts/install_deps.py" "$@"
    ;;
  python|python3)
    # ./run.sh python xxx.py [args]
    shift
    exec "$ROOT/.venv/bin/python" "$@"
    ;;
  -c)
    # ./run.sh -c "code"
    exec "$ROOT/.venv/bin/python" "$@"
    ;;
  pytest)
    # ./run.sh pytest [args]
    shift
    exec "$ROOT/.venv/bin/python" -m pytest "$@"
    ;;
  pip)
    # ./run.sh pip install xxx  (uv 创建的 venv 默认没装 pip, fallback 到 uv pip)
    shift
    if [ -x "$ROOT/.venv/bin/pip" ] || "$ROOT/.venv/bin/python" -m pip --version >/dev/null 2>&1; then
      exec "$ROOT/.venv/bin/python" -m pip "$@"
    else
      exec uv pip "$@"
    fi
    ;;
  uv)
    # ./run.sh uv sync / lock / etc.
    shift
    exec uv "$@"
    ;;
  alembic|ruff|mypy|black|pytest-cov|schemathesis|fastapi)
    # 常见 Python 工具
    shift
    exec "$ROOT/.venv/bin/python" -m "$(basename "$0" 2>/dev/null || echo "$0")" "$@" 2>/dev/null \
      || exec "$ROOT/.venv/bin/$1" "$@"
    ;;
  bash|sh|fish|zsh)
    # 交互 shell（PATH 里有 venv）
    shift
    exec "$1" "$@"
    ;;
  make)
    # 透传 make
    shift
    exec make -C "$ROOT" "$@"
    ;;
  hermes)
    # Hermes CLI（开发/调试）
    shift
    exec hermes "$@"
    ;;
  node|pnpm|npx)
    # Node.js 工具链
    exec "$@"
    ;;
  help|--help|-h)
    sed -n '2,15p' "$0" | sed 's/^# \?//'
    ;;
  *)
    # 未知命令：透传给 .venv/bin/python 当脚本执行（兼容旧用法）
    exec "$ROOT/.venv/bin/python" "$@"
    ;;
esac
