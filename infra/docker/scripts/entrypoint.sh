#!/bin/bash
# ============================================================
# Studio Javis 通用 entrypoint
# 职责：等待 PG/Redis 就绪 → 跑 DB 迁移 → exec 服务 CMD
# ============================================================
set -euo pipefail

echo "[entrypoint] starting ${SERVICE_NAME:-unknown} ..."

# --- 等待 PostgreSQL ---
if [[ -n "${DATABASE_URL:-}" ]]; then
    echo "[entrypoint] waiting for PostgreSQL..."
    # 从 DATABASE_URL 解析 host:port
    # 默认 localhost:5432，可被 WAIT_HOSTS 覆盖
    pg_host="${WAIT_PG_HOST:-localhost}"
    pg_port="${WAIT_PG_PORT:-5432}"
    until pg_isready -h "$pg_host" -p "$pg_port" -U javis -d javis 2>/dev/null; do
        echo "[entrypoint] pg not ready, retry in 2s..."
        sleep 2
    done
    echo "[entrypoint] PostgreSQL ready"

    # --- 跑 Alembic 迁移（仅 api-gateway） ---
    if [[ "${RUN_MIGRATIONS:-}" == "true" ]]; then
        echo "[entrypoint] running alembic upgrade head..."
        cd /app && alembic upgrade head
        echo "[entrypoint] migrations done"
    fi
fi

# --- 等待 Redis ---
if [[ -n "${REDIS_URL:-}" ]]; then
    redis_host="${WAIT_REDIS_HOST:-localhost}"
    redis_port="${WAIT_REDIS_PORT:-6379}"
    echo "[entrypoint] waiting for Redis..."
    until (echo PING | nc -w1 "$redis_host" "$redis_port" | grep -q PONG) 2>/dev/null; do
        echo "[entrypoint] redis not ready, retry in 1s..."
        sleep 1
    done
    echo "[entrypoint] Redis ready"
fi

echo "[entrypoint] starting service: $*"
exec "$@"
