#!/usr/bin/env bash
# start.sh — Studio Arona dev launcher
# 同时启动 SonettoHere (Python, 端口 8081) + Vite (5173)
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# 1. SonettoHere venv 不存在就建
if [ ! -d "$ROOT/.venv-sonetto" ]; then
  echo "[start] 创建 SonettoHere venv (Python 3.11) ..."
  /Users/zhangxuanning/.local/bin/uv venv --python /Users/zhangxuanning/.local/bin/python3.11 "$ROOT/.venv-sonetto"
  echo "[start] 装 SonettoHere 依赖 ..."
  /Users/zhangxuanning/.local/bin/uv pip install --python "$ROOT/.venv-sonetto/bin/python" \
    -i https://pypi.tuna.tsinghua.edu.cn/simple/ \
    -r "$ROOT/.sonetto-run/src/requirements.txt"
fi

# 2. SonettoHere src symlink 不存在就建
if [ ! -d "$ROOT/.sonetto-run" ]; then
  echo "[start] 创建 SonettoHere 源码 symlink ..."
  mkdir -p "$ROOT/.sonetto-run"
  ln -sf /Users/zhangxuanning/Downloads/SonettoHere-main "$ROOT/.sonetto-run/src"
fi

# 3. 启 SonettoHere (后台, 日志 → /tmp/sonetto.log)
SONETTO_LOG="/tmp/sonetto-$(date +%s).log"
echo "[start] 启 SonettoHere (端口 8081) → $SONETTO_LOG"
cd "$ROOT/.sonetto-run"
PYTHONPATH=src "$ROOT/.venv-sonetto/bin/python" -m uvicorn api.server:create_app --factory --host 127.0.0.1 --port 8081 > "$SONETTO_LOG" 2>&1 &
SONETTO_PID=$!
echo "[start] SonettoHere pid=$SONETTO_PID"

# 4. 等 health 5s
for i in {1..10}; do
  if curl -sf http://127.0.0.1:8081/api/health > /dev/null 2>&1; then
    echo "[start] SonettoHere up"
    break
  fi
  sleep 1
done

# 5. 启 Vite (前台)
cd "$ROOT/web"
echo "[start] 启 Vite (端口 5173)..."
exec pnpm dev
