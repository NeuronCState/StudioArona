#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Studio Arona 前后端启动脚本
# Docker 仅跑 PG + Redis，Python/Node 服务在宿主机运行
#
# 自愈逻辑:
#   - 检测 .venv 中 shebang 是否仍指向旧路径（项目目录被改名后常见），
#     自动重建虚拟环境，避免 alembic / uvicorn 因 ENOENT 失败。
#   - 清理 Vite 依赖缓存，避免上次开发时遗留的优化产物干扰新会话。
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Navigate to project root (script is at infra/scripts/start.sh)
cd "$SCRIPT_DIR/../.."

# ── 颜色定义 ──────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
DIM='\033[2m'
NC='\033[0m'

# ── 日志函数 ──────────────────────────────
log()      { printf "${GREEN}[%s]${NC} %s\n" "$(date +%H:%M:%S)" "$*"; }
warn()     { printf "${YELLOW}[%s] ⚠${NC}  %s\n" "$(date +%H:%M:%S)" "$*"; }
err()      { printf "${RED}[%s] ✗${NC}  %s\n" "$(date +%H:%M:%S)" "$*" >&2; }
info()     { printf "${CYAN}[%s]${NC} %s\n" "$(date +%H:%M:%S)" "$*"; }
step()     { printf "\n${MAGENTA}[%s] ── %s ──${NC}\n" "$(date +%H:%M:%S)" "$*"; }
ok()       { printf "${GREEN}[%s] ✓${NC}  %s\n" "$(date +%H:%M:%S)" "$*"; }
detail()   { printf "${DIM}[%s]    %s${NC}\n" "$(date +%H:%M:%S)" "$*"; }
highlight(){ printf "${WHITE}[%s] →${NC}  %s\n" "$(date +%H:%M:%S)" "$*"; }

COMPOSE_FILE="infra/compose/docker-compose.yml"
PIDS=()

cleanup() {
    echo ""
    step "正在关闭所有服务"

    for pid in "${PIDS[@]:-}"; do
        pkill -P "$pid" 2>/dev/null || true
        kill "$pid" 2>/dev/null || true
        wait "$pid" 2>/dev/null || true
    done

    detail "终止残留进程..."
    pkill -f "uvicorn app.main" 2>/dev/null || true
    pkill -f "openclaw gateway" 2>/dev/null || true
    pkill -f "node services/agent/bridge" 2>/dev/null || true
    pkill -f "pnpm.*web dev" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true

    detail "停止 Docker 容器..."
    docker compose -f "$COMPOSE_FILE" stop 2>/dev/null || true

    ok "所有服务已关闭，再见！"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# ── 启动横幅 ──────────────────────────────

echo ""
printf "${CYAN}╔══════════════════════════════════════════╗${NC}\n"
printf "${CYAN}║${NC}  ${WHITE}Studio Arona — 前后端启动${NC}              ${CYAN}║${NC}\n"
printf "${CYAN}║${NC}  ${DIM}什亭之匣 AI · 工作室智能公告板${NC}         ${CYAN}║${NC}\n"
printf "${CYAN}╚══════════════════════════════════════════╝${NC}\n"
echo ""
detail "当前用户: $(whoami)"
detail "工作目录: $(pwd)"
detail "系统平台: $(uname -s) $(uname -m)"
detail "启动时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ── 前置检查 ──────────────────────────────

step "环境检查"

if ! command -v docker &>/dev/null; then
    err "未找到 Docker，请先安装 Docker Desktop"
    exit 1
fi
ok "Docker 已安装"

if ! docker info &>/dev/null; then
    err "Docker 未运行，请先启动 Docker Desktop"
    exit 1
fi
ok "Docker 守护进程运行中"

if ! command -v uv &>/dev/null; then
    err "未找到 uv，请先安装：curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi
ok "uv 已安装 ($(uv --version 2>/dev/null || echo 'unknown'))"

if ! command -v pnpm &>/dev/null; then
    err "未找到 pnpm，请先安装：npm install -g pnpm"
    exit 1
fi
ok "pnpm 已安装 ($(pnpm --version 2>/dev/null || echo 'unknown'))"

if command -v node &>/dev/null; then
    ok "Node.js 已安装 ($(node --version))"
else
    warn "未找到 Node.js，agent bridge 将无法启动"
fi

if command -v openclaw &>/dev/null; then
    ok "OpenClaw 已安装 ($(openclaw --version 2>/dev/null | head -1 || echo 'unknown'))"
else
    warn "未找到 OpenClaw，将仅使用 MiniMax 直连模式"
fi

# ── 加载环境变量 ──────────────────────────

if [ ! -f ".env.local" ]; then
    warn ".env.local 不存在，从 .env.example 复制"
    cp .env.example .env.local
fi

set -a
source .env.local
set +a

detail "已加载 .env.local"
detail "运行环境: ${APP_ENV:-development}"
detail "数据库: ${DATABASE_URL%%@***}"  # 隐藏密码
detail "Bridge 端口: ${BRIDGE_PORT:-18790}"
detail "MiniMax API Key: ${MINIMAX_API_KEY:0:8}...${MINIMAX_API_KEY: -4}"

# ── 端口冲突检测 ────────────────────────────

step "端口冲突检测"

check_port_conflict() {
    local port=$1
    local service=$2
    if lsof -ti ":${port}" >/dev/null 2>&1; then
        local pids
        pids=$(lsof -ti ":${port}" 2>/dev/null | tr '\n' ' ')
        warn "端口 ${port} (${service}) 已被占用，PID: ${pids}"
        return 1
    fi
    detail "端口 ${port} (${service}) 空闲"
    return 0
}

conflicting_ports=""
check_port_conflict 5432 "PostgreSQL"         || conflicting_ports="${conflicting_ports}5432 "
check_port_conflict 6379 "Redis"              || conflicting_ports="${conflicting_ports}6379 "
check_port_conflict 8080 "API Gateway"        || conflicting_ports="${conflicting_ports}8080 "
check_port_conflict 18789 "OpenClaw Gateway"  || conflicting_ports="${conflicting_ports}18789 "
check_port_conflict 18790 "Agent Bridge"      || conflicting_ports="${conflicting_ports}18790 "
check_port_conflict 8002 "Perception"         || conflicting_ports="${conflicting_ports}8002 "
check_port_conflict 5173 "前端 (Vite)"         || conflicting_ports="${conflicting_ports}5173 "

if [ -n "$conflicting_ports" ]; then
    num_conflicts=$(echo $conflicting_ports | wc -w | tr -d ' ')
    echo ""
    warn "有 ${num_conflicts} 个端口被占用: ${conflicting_ports}"
    if [ ! -t 0 ]; then
        detail "非交互模式，自动终止冲突进程"
        answer="Y"
    else
        printf "${YELLOW}输入 Y 确认终止，其他键退出：${NC} "
        read -r answer
    fi
    if [ "$answer" != "Y" ] && [ "$answer" != "y" ]; then
        err "用户取消启动"
        exit 1
    fi
    for port in $conflicting_ports; do
        detail "终止占用端口 ${port} 的进程..."
        kill -9 $(lsof -ti ":${port}" 2>/dev/null) 2>/dev/null || true
    done
    sleep 2
    ok "冲突进程已清理"
else
    ok "所有端口空闲"
fi

# ── venv 自愈检查 ────────────────────────────

step "Python 虚拟环境检查"

needs_venv_rebuild=0
if [ ! -x ".venv/bin/python" ]; then
    warn ".venv/bin/python 不存在"
    needs_venv_rebuild=1
elif ! .venv/bin/python -c "import sys" >/dev/null 2>&1; then
    warn ".venv/bin/python 无法运行（可能是项目目录改名后残留的旧路径）"
    needs_venv_rebuild=1
elif [ -f ".venv/bin/uvicorn" ] && ! .venv/bin/uvicorn --version >/dev/null 2>&1; then
    warn "uvicorn 无法运行，需要重建虚拟环境"
    needs_venv_rebuild=1
fi

if [ "$needs_venv_rebuild" -eq 1 ]; then
    detail "正在重建虚拟环境..."
    rm -rf .venv
    uv sync
    ok "虚拟环境已重建"
else
    ok "虚拟环境正常 (.venv/bin/python 可用)"
fi

# ── Vite 缓存清理 ────────────────────────────

if [ -d "apps/web/node_modules/.vite" ]; then
    rm -rf apps/web/node_modules/.vite
    detail "已清理 Vite 依赖缓存"
fi

# ── 1. 启动 PG + Redis ────────────────────

step "1/4 启动 PostgreSQL + Redis"

detail "正在拉起 Docker 容器..."
docker compose -f "$COMPOSE_FILE" up -d postgres redis

detail "等待 PostgreSQL 就绪..."
pg_ready=0
for i in $(seq 1 30); do
    if docker compose -f "$COMPOSE_FILE" exec postgres pg_isready -U javis > /dev/null 2>&1; then
        pg_ready=1
        break
    fi
    printf "${DIM}[%s]    等待 PostgreSQL... (%d/30)${NC}\r" "$(date +%H:%M:%S)" "$i"
    sleep 1
done
if [ "$pg_ready" -eq 1 ]; then
    ok "PostgreSQL 已就绪 (端口 5432, 用户 javis)"
else
    err "PostgreSQL 启动超时（30秒）"
    exit 1
fi

detail "等待 Redis 就绪..."
redis_ready=0
for i in $(seq 1 15); do
    if docker compose -f "$COMPOSE_FILE" exec redis redis-cli ping > /dev/null 2>&1; then
        redis_ready=1
        break
    fi
    printf "${DIM}[%s]    等待 Redis... (%d/15)${NC}\r" "$(date +%H:%M:%S)" "$i"
    sleep 1
done
if [ "$redis_ready" -eq 1 ]; then
    ok "Redis 已就绪 (端口 6379)"
else
    err "Redis 启动超时（15秒）"
    exit 1
fi

# ── 2. 数据库迁移 ─────────────────────────

step "2/4 数据库迁移"

if ! .venv/bin/python -c "import sqlalchemy" &>/dev/null; then
    err "venv 损坏：无法导入 sqlalchemy，请先运行 uv sync"
    err "常见原因：Python 版本升级导致 .venv 中的 C 扩展不兼容"
    exit 1
fi
detail "sqlalchemy 导入检查通过"

rm -f /tmp/alembic-*.log 2>/dev/null || true
alembic_log=$(mktemp /tmp/alembic-XXXXXXXX.log)
trap 'err "alembic 迁移失败，日志: $alembic_log"; exit 1' ERR
detail "正在执行 alembic upgrade head..."
.venv/bin/alembic -c alembic.ini upgrade head > "$alembic_log" 2>&1
trap - ERR
rm -f "$alembic_log"
ok "数据库迁移完成"

# ── 3. 启动后端服务 (host 进程) ───────────

step "3/4 启动后端服务"

# api-gateway (port 8080)
detail "正在启动 API Gateway..."
.venv/bin/uvicorn app.main:app --app-dir services/api-gateway --host 0.0.0.0 --port 8080 --reload --reload-dir services/api-gateway/app &
PIDS+=($!)
ok "API Gateway 已启动 (PID $!, 端口 8080)"
detail "  → 文档: http://localhost:8080/docs"

# OpenClaw gateway (port 18789)
if command -v openclaw &>/dev/null; then
    detail "正在启动 OpenClaw Gateway..."
    openclaw gateway --port 18789 --verbose &
    PIDS+=($!)
    ok "OpenClaw Gateway 已启动 (PID $!, 端口 18789)"
else
    warn "openclaw 未安装，跳过 OpenClaw Gateway（仅 MiniMax 直连可用）"
fi

# agent bridge (port $BRIDGE_PORT, default 18790)
if [ -f "services/agent/bridge/server.js" ]; then
    detail "正在启动 Agent Bridge..."
    node services/agent/bridge/server.js &
    PIDS+=($!)
    ok "Agent Bridge 已启动 (PID $!, 端口 ${BRIDGE_PORT:-18790})"
    detail "  → 健康检查: http://localhost:${BRIDGE_PORT:-18790}/health"
else
    warn "services/agent/bridge/server.js 不存在，跳过 Agent Bridge"
fi

# perception (port 8002)
detail "正在启动 Perception 服务..."
.venv/bin/uvicorn app.main:app --app-dir services/perception --host 0.0.0.0 --port 8002 --reload --reload-dir services/perception/app &
PIDS+=($!)
ok "Perception 服务已启动 (PID $!, 端口 8002)"

detail "等待后端服务初始化..."
sleep 2

# ── 4. 启动前端 ───────────────────────────

step "4/4 启动前端"

detail "正在启动 Vite 开发服务器..."
pnpm --filter web dev &
PIDS+=($!)
ok "前端已启动 (PID $!, 端口 5173)"

sleep 2

# ── 启动完成 ──────────────────────────────

echo ""
printf "${GREEN}╔══════════════════════════════════════════╗${NC}\n"
printf "${GREEN}║${NC}  ${WHITE}✓ 所有服务已启动${NC}                        ${GREEN}║${NC}\n"
printf "${GREEN}╚══════════════════════════════════════════╝${NC}\n"
echo ""
printf "  ${CYAN}前端页面${NC}      http://localhost:5173\n"
printf "  ${CYAN}API 网关${NC}      http://localhost:8080\n"
printf "  ${CYAN}API 文档${NC}      http://localhost:8080/docs\n"
printf "  ${CYAN}OC Gateway${NC}   http://localhost:18789\n"
printf "  ${CYAN}Agent Bridge${NC} http://localhost:${BRIDGE_PORT:-18790}\n"
printf "  ${CYAN}Perception${NC}   http://localhost:8002\n"
echo ""
printf "  ${DIM}按 Ctrl+C 关闭所有服务${NC}\n"
echo ""
warn "如果前端页面白屏 / 一直在加载，先排查浏览器侧缓存："
detail "1. 打开 DevTools → Application → Service Workers → Unregister"
detail "2. Application → Storage → Clear site data"
detail "3. 强制刷新（Cmd+Shift+R）"
echo ""

wait
