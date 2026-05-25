#!/bin/bash
# ============================================================
# Studio Javis Linux 生产部署脚本
# 使用: bash infra/scripts/deploy-linux.sh v0.1.0
# ============================================================
set -euo pipefail

TAG="${1:-latest}"
echo "=== 部署 Studio Javis $TAG 到 Linux 生产环境 ==="

# 1. 切到目标 tag
echo "[1/5] 拉取代码..."
git fetch origin --tags
git checkout "$TAG"

# 2. 拉取镜像
echo "[2/5] 拉取 Docker 镜像..."
IMAGE_TAG="$TAG" docker compose -f infra/compose/docker-compose.prod.yml pull

# 3. 数据库迁移
echo "[3/5] 运行数据库迁移..."
uv run alembic upgrade head

# 4. 启动
echo "[4/5] 启动服务..."
IMAGE_TAG="$TAG" docker compose -f infra/compose/docker-compose.prod.yml up -d

# 5. 健康检查
echo "[5/5] 健康检查..."
sleep 5
./infra/docker/scripts/healthcheck.sh || {
    echo "❌ 健康检查失败，执行回滚"
    ./infra/scripts/rollback.sh "$(git describe --tags --abbrev=0 HEAD~1)"
    exit 1
}

echo "=== 部署完成 ==="
docker compose -f infra/compose/docker-compose.prod.yml ps
