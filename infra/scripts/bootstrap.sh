#!/bin/bash
# ============================================================
# Studio Javis 一键初始化脚本
# 使用: bash infra/scripts/bootstrap.sh
# ============================================================
set -euo pipefail

echo "=== Studio Javis 环境初始化 ==="

# 1. 依赖
echo "[1/6] 安装 Node 依赖..."
pnpm install

echo "[2/6] 安装 Python 依赖..."
uv sync --all-packages

# 2. 环境变量
if [ ! -f .env.local ]; then
    echo "[3/6] 创建 .env.local..."
    cp .env.example .env.local
else
    echo "[3/6] .env.local 已存在，跳过"
fi

# 3. 启动 PG + Redis
echo "[4/6] 启动 PostgreSQL + Redis..."
docker compose -f infra/compose/docker-compose.yml up -d postgres redis
sleep 3

# 4. 数据库迁移
echo "[5/6] 运行数据库迁移..."
uv run alembic upgrade head

# 5. Seed 数据
echo "[6/6] 写入 seed 数据..."
uv run python infra/scripts/seed_dev_data.py 2>/dev/null || echo "   (seed 脚本占位，跳过)"

echo "=== 初始化完成 ==="
echo "运行 make dev 启动全栈"
