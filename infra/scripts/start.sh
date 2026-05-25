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

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { printf "${GREEN}[%s]${NC} %s\n" "$(date +%H:%M:%S)" "$*"; }
warn() { printf "${YELLOW}[%s] WARN${NC} %s\n" "$(date +%H:%M:%S)" "$*"; }
err()  { printf "${RED}[%s] ERROR${NC} %s\n" "$(date +%H:%M:%S)" "$*" >&2; }
info() { printf "${CYAN}[%s]${NC} %s\n" "$(date +%H:%M:%S)" "$*"; }

COMPOSE_FILE="infra/compose/docker-compose.yml"
PIDS=()

cleanup() {
    echo ""
    warn "正在关闭所有服务..."

    for pid in "${PIDS[@]:-}"; do
        # kill child processes first, then the parent
        pkill -P "$pid" 2>/dev/null || true
        kill "$pid" 2>/dev/null || true
        wait "$pid" 2>/dev/null || true
    done

    # safety net: kill any remaining known service processes
    pkill -f "uvicorn app.main" 2>/dev/null || true
    pkill -f "node services/agent/bridge" 2>/dev/null || true
    pkill -f "pnpm.*web dev" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true

    docker compose -f "$COMPOSE_FILE" stop 2>/dev/null || true

    log "所有服务已关闭"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# ── 前置检查 ──────────────────────────────

if ! command -v docker &>/dev/null; then
    err "未找到 Docker，请先安装 Docker Desktop"
    exit 1
fi

if ! docker info &>/dev/null; then
    err "Docker 未运行，请先启动 Docker Desktop"
    exit 1
fi

if ! command -v uv &>/dev/null; then
    err "未找到 uv，请先安装：curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

if ! command -v pnpm &>/dev/null; then
    err "未找到 pnpm，请先安装：npm install -g pnpm"
    exit 1
fi

if [ ! -f ".env.local" ]; then
    warn ".env.local 不存在，从 .env.example 复制"
    cp .env.example .env.local
fi

# 加载 .env.local 环境变量
set -a
source .env.local
set +a

# ── 端口冲突检测 ────────────────────────────
# 检测关键端口是否被占用，被占用时询问用户是否要终止那些进程
check_port_conflict() {
    local port=$1
    local service=$2
    if lsof -ti ":${port}" >/dev/null 2>&1; then
        local pids
        pids=$(lsof -ti ":${port}" 2>/dev/null | tr '\n' ' ')
        printf "${YELLOW}[%s]${NC} 端口 ${port} (${service}) 已被占用，PID: %s\n" "$(date +%H:%M:%S)" "$pids"
        return 1
    fi
    return 0
}

conflicting_ports=""
check_port_conflict 5173 "前端 (Vite)"    || conflicting_ports="${conflicting_ports}5173 "
check_port_conflict 8080 "API Gateway"   || conflicting_ports="${conflicting_ports}8080 "
check_port_conflict 18790 "Agent Bridge"  || conflicting_ports="${conflicting_ports}8001 "
check_port_conflict 8002 "Perception"    || conflicting_ports="${conflicting_ports}8002 "
check_port_conflict 5432 "PostgreSQL"    || conflicting_ports="${conflicting_ports}5432 "
check_port_conflict 6379 "Redis"         || conflicting_ports="${conflicting_ports}6379 "

if [ -n "$conflicting_ports" ]; then
    num_conflicts=$(echo $conflicting_ports | wc -w | tr -d ' ')
    echo ""
    printf "${YELLOW}有 %d 个端口被占用，是否要终止占用这些端口的进程？${NC}\n" "$num_conflicts"
    printf "  被占用端口: %s\n" "$conflicting_ports"
    # 非交互式运行（./start.sh &）时自动确认，避免后台运行时卡住
    if [ ! -t 0 ]; then
        printf "${CYAN}[%s]${NC} 非交互模式，自动终止冲突进程\n" "$(date +%H:%M:%S)"
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
        printf "${CYAN}[%s]${NC} 终止占用端口 %d 的进程...\n" "$(date +%H:%M:%S)" "$port"
        kill -9 $(lsof -ti ":${port}" 2>/dev/null) 2>/dev/null || true
    done
    sleep 2
    log "冲突进程已清理"
fi

# ── venv 自愈检查 ────────────────────────────
# 项目目录改名后，.venv/bin/* 里的脚本仍带着旧的绝对路径 shebang，
# 任何 .venv 二进制都会以 "No such file or directory" 失败 → 在此自动重建。
needs_venv_rebuild=0
if [ ! -x ".venv/bin/python" ]; then
    needs_venv_rebuild=1
elif ! .venv/bin/python -c "import sys" >/dev/null 2>&1; then
    needs_venv_rebuild=1
elif [ -f ".venv/bin/uvicorn" ] && ! .venv/bin/uvicorn --version >/dev/null 2>&1; then
    needs_venv_rebuild=1
fi

if [ "$needs_venv_rebuild" -eq 1 ]; then
    warn ".venv 不可用（很可能是项目目录改名后残留的旧路径），正在重建..."
    rm -rf .venv
    uv sync
    log "虚拟环境已重建"
fi

# ── Vite 缓存清理 ────────────────────────────
# Vite 把依赖优化成果缓存到 apps/web/node_modules/.vite/，目录改名 / 依赖变化时
# 这份缓存可能与当前模块图错位，导致前端白屏一直转圈。每次启动清掉即可，
# 代价仅是首次冷启动多 1-2 秒。
if [ -d "apps/web/node_modules/.vite" ]; then
    rm -rf apps/web/node_modules/.vite
fi

echo ""
info "========================================="
info "  Studio Arona — 前后端启动"
info "========================================="
echo ""

# ── 1. 启动 PG + Redis ────────────────────

log "1/4 启动 PostgreSQL + Redis..."
docker compose -f "$COMPOSE_FILE" up -d postgres redis

log "等待 PostgreSQL 就绪..."
for i in $(seq 1 30); do
    if docker compose -f "$COMPOSE_FILE" exec postgres pg_isready -U javis > /dev/null 2>&1; then
        log "PostgreSQL 已就绪"
        break
    fi
    if [ "$i" -eq 30 ]; then
        err "PostgreSQL 启动超时"
        exit 1
    fi
    sleep 1
done

log "等待 Redis 就绪..."
for i in $(seq 1 15); do
    if docker compose -f "$COMPOSE_FILE" exec redis redis-cli ping > /dev/null 2>&1; then
        log "Redis 已就绪"
        break
    fi
    if [ "$i" -eq 15 ]; then
        err "Redis 启动超时"
        exit 1
    fi
    sleep 1
done

# ── 2. 数据库迁移 ─────────────────────────

log "2/4 运行数据库迁移..."

# 预检查：确保 venv 中 sqlalchemy 可用
if ! .venv/bin/python -c "import sqlalchemy" &>/dev/null; then
    err "venv 损坏：无法导入 sqlalchemy，请先运行 uv sync"
    err "常见原因：Python 版本升级导致 .venv 中的 C 扩展不兼容"
    exit 1
fi

alembic_log=$(mktemp /tmp/alembic-XXXXXX.log)
trap 'err "alembic 迁移失败，日志: $alembic_log"; exit 1' ERR
.venv/bin/alembic -c alembic.ini upgrade head > "$alembic_log" 2>&1
trap - ERR
rm -f "$alembic_log"
log "数据库迁移完成"

# ── 3. 启动后端服务 (host 进程) ───────────

log "3/4 启动后端服务..."

# api-gateway (port 8080)
.venv/bin/uvicorn app.main:app --app-dir services/api-gateway --host 0.0.0.0 --port 8080 --reload --reload-dir services/api-gateway/app &
PIDS+=($!)
log "api-gateway 已启动 (PID $!, port 8080)"

# agent bridge (port 8001)
if [ -f "services/agent/bridge/server.js" ]; then
    node services/agent/bridge/server.js &
    PIDS+=($!)
    log "agent bridge 已启动 (PID $!, port $BRIDGE_PORT)"
else
    warn "services/agent/bridge/server.js 不存在，跳过 agent bridge"
fi

# perception (port 8002) — 有摄像头权限问题时会有警告
.venv/bin/uvicorn app.main:app --app-dir services/perception --host 0.0.0.0 --port 8002 --reload --reload-dir services/perception/app &
PIDS+=($!)
log "perception 已启动 (PID $!, port 8002)"

sleep 2

# ── 4. 启动前端 ───────────────────────────

log "4/4 启动前端 (Vite dev server, ..."
pnpm --filter web dev &
PIDS+=($!)
log "前端已启动 (PID $!, port 5173)"

sleep 2
echo ""
info "========================================="
info "  服务已全部启动"
info "========================================="
info "  后端网关:  http://localhost:8080"
info "  API 文档:  http://localhost:8080/docs"
info "  前端页面:  http://localhost:5173"
info "  Perception: http://localhost:8002"
info ""
info "  按 Ctrl+C 关闭所有服务"
info "========================================="
echo ""
warn "如果前端页面白屏 / 一直在加载，先排查浏览器侧缓存："
warn "  1. 打开 DevTools → Application → Service Workers → Unregister"
warn "  2. Application → Storage → Clear site data"
warn "  3. 强制刷新（Cmd+Shift+R）"
warn "  详细排查见 docs/runbook/A_前端Runbook.md 第 1.1 / 2.1 节"
echo ""

wait
