#!/bin/bash
# ============================================================
# Studio Javis 数据库恢复脚本
# 使用: bash infra/scripts/restore.sh <dump_file.sql.gz>
# 警告: 会覆盖当前数据库！
# ============================================================
set -euo pipefail

DUMP_FILE="${1:-}"
if [ -z "$DUMP_FILE" ] || [ ! -f "$DUMP_FILE" ]; then
    echo "用法: restore.sh <dump_file.sql.gz>"
    echo "示例: restore.sh /opt/studio-javis/backups/javis_20260521_030000.sql.gz"
    exit 1
fi

echo "=== Studio Javis 数据库恢复 ==="
echo "来源: $DUMP_FILE"
echo ""
echo "⚠️  警告: 此操作将覆盖当前数据库！"
read -p "确认继续? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
fi

# 停止依赖数据库的服务
echo "[1/4] 停止应用服务..."
docker compose -f infra/compose/docker-compose.prod.yml stop api-gateway agent perception

# 恢复数据库
echo "[2/4] 恢复数据库..."
gunzip -c "$DUMP_FILE" | docker compose -f infra/compose/docker-compose.prod.yml exec -T postgres \
    psql -U javis -d javis --single-transaction

# 重启服务
echo "[3/4] 重启应用服务..."
docker compose -f infra/compose/docker-compose.prod.yml up -d api-gateway agent perception

# 健康检查
echo "[4/4] 健康检查..."
sleep 5
./infra/docker/scripts/healthcheck.sh && echo "=== 恢复完成 ===" || {
    echo "❌ 健康检查失败，请手动排查"
    exit 1
}
