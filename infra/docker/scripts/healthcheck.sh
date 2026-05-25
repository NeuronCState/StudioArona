#!/bin/bash
# ============================================================
# Studio Javis 通用 health check
# 每个服务暴露 /health endpoint；若不可用则退到进程存活检测
# ============================================================
set -euo pipefail

# 优先用 HTTP /health
if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
    exit 0
fi

# 退路：进程存活
pgrep -f "uvicorn" >/dev/null 2>&1 && exit 0

exit 1
