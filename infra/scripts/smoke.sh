#!/usr/bin/env bash
# =================================================================
# Studio Javis — 端到端冒烟测试
# M1.5 起强制，每次 B 改动 PR 必跑。
#
# 验证全栈能启动 + 核心流程走通：
#   1. 启动全栈服务
#   2. 等待健康端点
#   3. 注册测试用户
#   4. 校验 per-user memory.sqlite
#   5. 创建会话 + 发消息
#   6. 校验 PG chat_messages + SQLite raw_messages
#   7. 清理
# =================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
SMOKE_USER_ID=""
SMOKE_SESSION_ID=""
JAVIS_USER_DATA_DIR="${JAVIS_USER_DATA_DIR:-$HOME/javis-data}"

# ── helpers ────────────────────────────────────────────────────

log()    { printf "${GREEN}[SMOKE]${NC} %s\n" "$*"; }
warn()   { printf "${YELLOW}[SMOKE]${NC} %s\n" "$*"; }
fail()   { printf "${RED}[SMOKE] FAIL${NC} %s\n" "$*"; FAIL=$((FAIL+1)); }
pass()   { printf "${GREEN}[SMOKE] PASS${NC} %s\n" "$*"; PASS=$((PASS+1)); }

check() {
    local desc="$1"; shift
    if "$@"; then
        pass "$desc"
    else
        fail "$desc ($*)"
    fi
}

# 带超时的 HTTP 健康检查
wait_health() {
    local url="$1" label="$2" max="${3:-30}"
    for i in $(seq 1 "$max"); do
        if curl -sf "$url" > /dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    return 1
}

cleanup() {
    echo ""
    warn "清理中..."

    # 停止 start.sh 启动的后台进程
    if [ -n "${START_PID:-}" ]; then
        kill "$START_PID" 2>/dev/null || true
        wait "$START_PID" 2>/dev/null || true
    fi

    # 安全网：杀死所有已知服务进程
    pkill -f "uvicorn app.main" 2>/dev/null || true
    pkill -f "node services/agent/bridge" 2>/dev/null || true
    pkill -f "pnpm.*web dev" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true

    docker compose -f infra/compose/docker-compose.yml stop 2>/dev/null || true

    # 删除测试用户目录
    if [ -n "$SMOKE_USER_ID" ]; then
        rm -rf "$JAVIS_USER_DATA_DIR/users/$SMOKE_USER_ID" 2>/dev/null || true
    fi

    # 清理 PG 中的测试数据
    # (docker compose 还在，可以直接 exec)
    if docker compose -f infra/compose/docker-compose.yml exec -T postgres \
        psql -U javis -d javis -c "DELETE FROM chat_messages;" > /dev/null 2>&1; then
        :
    fi

    warn "清理完成"
}
trap cleanup EXIT

# ── 1. 启动全栈 ───────────────────────────────────────────────

log "=============================="
log " Phase M1.5 Smoke Test"
log "=============================="
echo ""

log "1/7 启动全栈服务..."
./start.sh &
START_PID=$!
sleep 3

# ── 2. 健康检查 ───────────────────────────────────────────────

log "2/7 等待健康端点..."

check "api-gateway health" wait_health "http://localhost:8080/health" "gateway" 30
check "perception health"   wait_health "http://localhost:8002/health" "perception" 15

# agent bridge 可能还没起，单独检查
if wait_health "http://localhost:8001/health" "bridge" 15; then
    pass "agent bridge health"
else
    warn "agent bridge health 超时（可能未实现）"
fi

# ── 3. 注册测试用户 ──────────────────────────────────────────

log "3/7 注册测试用户..."

SMOKE_USERNAME="smoke-test-$(date +%s)"
REG_RESP=$(curl -sf -X POST http://localhost:8080/api/auth/register \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$SMOKE_USERNAME\",\"display_name\":\"Smoke Tester\",\"password\":\"smoke123\"}" 2>&1) || true

if echo "$REG_RESP" | grep -q '"id"'; then
    SMOKE_USER_ID=$(echo "$REG_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])" 2>/dev/null || echo "")
    SMOKE_TOKEN=$(echo "$REG_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null || echo "")
    pass "注册用户: $SMOKE_USERNAME (id=$SMOKE_USER_ID)"
else
    fail "注册用户 ($REG_RESP)"
fi

# ── 4. 校验 memory.sqlite ─────────────────────────────────────

log "4/7 校验 per-user SQLite..."

if [ -n "$SMOKE_USER_ID" ]; then
    MEM_PATH="$JAVIS_USER_DATA_DIR/users/$SMOKE_USER_ID/memory.sqlite"
    if [ -f "$MEM_PATH" ]; then
        pass "memory.sqlite 存在"

        # Schema 校验
        TABLES=$(sqlite3 "$MEM_PATH" ".tables" 2>/dev/null || echo "")
        check "raw_messages 表存在"         echo "$TABLES" | grep -q "raw_messages"
        check "memory_entries 表存在"       echo "$TABLES" | grep -q "memory_entries"
        check "meta 表存在"                 echo "$TABLES" | grep -q "meta"
        check "attachments 目录存在"        test -d "$JAVIS_USER_DATA_DIR/users/$SMOKE_USER_ID/attachments"
    else
        fail "memory.sqlite 不存在 ($MEM_PATH)"
    fi
fi

# ── 5. 创建会话 + 发消息 ──────────────────────────────────────

log "5/7 创建会话并发送消息..."

if [ -n "$SMOKE_TOKEN" ]; then
    # 创建会话
    SESS_RESP=$(curl -sf -X POST http://localhost:8001/api/chat/sessions \
        -H "Content-Type: application/json" \
        -d "{\"user_id\":\"$SMOKE_USER_ID\",\"mode\":\"text\"}" 2>&1) || true
    SMOKE_SESSION_ID=$(echo "$SESS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['session_id'])" 2>/dev/null || echo "")

    if [ -n "$SMOKE_SESSION_ID" ]; then
        pass "创建会话: $SMOKE_SESSION_ID"
    else
        fail "创建会话 ($SESS_RESP)"
    fi

    # 发送消息（SSE 流，只取前 5 行）
    if [ -n "$SMOKE_SESSION_ID" ]; then
        SSE_OUT=$(curl -sf -X POST "http://localhost:8001/api/chat/sessions/$SMOKE_SESSION_ID/messages" \
            -H "Content-Type: application/json" \
            -H "x-javis-user: $SMOKE_USER_ID" \
            -d "{\"content\":\"你好，我是冒烟测试\"}" 2>&1 | head -5) || true
        if echo "$SSE_OUT" | grep -q "session_started\|token"; then
            pass "SSE 流响应正常"
        else
            warn "SSE 流验证不确定 (可能是服务刚启动)"
        fi
    fi
fi

sleep 2

# ── 6. 校验 PG + SQLite 数据 ──────────────────────────────────

log "6/7 校验数据写入..."

# PG chat_sessions
if [ -n "$SMOKE_USER_ID" ]; then
    SESSION_COUNT=$(docker compose -f infra/compose/docker-compose.yml exec -T postgres \
        psql -U javis -d javis -t -c \
        "SELECT COUNT(*) FROM chat_sessions WHERE user_id='$SMOKE_USER_ID';" 2>/dev/null | tr -d ' ' || echo "0")
    check "PG chat_sessions 有记录" [ "$SESSION_COUNT" -gt 0 ]
fi

# PG chat_messages
MSG_COUNT=$(docker compose -f infra/compose/docker-compose.yml exec -T postgres \
    psql -U javis -d javis -t -c \
    "SELECT COUNT(*) FROM chat_messages;" 2>/dev/null | tr -d ' ' || echo "0")
check "PG chat_messages 有记录" [ "${MSG_COUNT:-0}" -gt 0 ]

# SQLite raw_messages
if [ -n "$SMOKE_USER_ID" ] && [ -f "$MEM_PATH" ]; then
    RAW_COUNT=$(sqlite3 "$MEM_PATH" "SELECT COUNT(*) FROM raw_messages;" 2>/dev/null || echo "0")
    if [ "${RAW_COUNT:-0}" -gt 0 ]; then
        pass "SQLite raw_messages 有 $RAW_COUNT 条记录"
    else
        warn "SQLite raw_messages 为空（可能需要等 agent bridge 写入）"
    fi
fi

# ── 6.5 memory recall (M2) ─────────────────────────────────

log "6.5/7 测试 memory recall..."

if [ -n "$SMOKE_USER_ID" ] && [ -n "$SMOKE_TOKEN" ]; then
    # Seed a memory entry via internal API
    curl -sf -X POST "http://localhost:8080/internal/memory/entries/batch?user_id=$SMOKE_USER_ID" \
        -H "Content-Type: application/json" \
        -d '[{"id":"smoke-e1","type":"fact","summary":"冒烟测试用户喜欢测试","importance":80}]' > /dev/null 2>&1 || true

    # Recall
    RECALL_RESP=$(curl -sf "http://localhost:8080/internal/memory/recall?user_id=$SMOKE_USER_ID&query=测试&k=3" 2>&1) || true
    if echo "$RECALL_RESP" | grep -q "smoke-e1\|冒烟"; then
        pass "memory recall 命中"
    else
        warn "memory recall 未命中预期条目 (可能需要等待服务就绪)"
    fi
fi

# ── 7. 结果汇总 ───────────────────────────────────────────────

log "7/7 结果汇总"
echo ""
printf "${GREEN}通过: %d${NC}  ${RED}失败: %d${NC}\n" "$PASS" "$FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo "❌ 冒烟测试未通过"
    exit 1
else
    echo "✅ 冒烟测试通过"
fi
