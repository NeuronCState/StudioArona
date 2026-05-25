#!/bin/bash
# ============================================================
# Studio Javis 回滚脚本
# 使用: bash infra/scripts/rollback.sh v0.0.9
# ============================================================
set -euo pipefail

TAG="${1:-}"
if [ -z "$TAG" ]; then
    echo "用法: rollback.sh <上一个稳定版本 tag>"
    exit 1
fi

echo "=== 回滚到 $TAG ==="

git checkout "$TAG"
IMAGE_TAG="$TAG" docker compose -f infra/compose/docker-compose.prod.yml up -d

# 检查是否有不可逆迁移
UNREVERSIBLE=$(grep -r "IRREVERSIBLE" infra/db/migrations/ 2>/dev/null || true)
if [ -n "$UNREVERSIBLE" ]; then
    echo "⚠️  存在不可逆迁移:"
    echo "$UNREVERSIBLE"
    echo "请手动恢复数据库快照"
fi

echo "=== 回滚完成 ==="
docker compose -f infra/compose/docker-compose.prod.yml ps
