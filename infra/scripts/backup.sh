#!/bin/bash
# ============================================================
# Studio Javis 数据库备份脚本
# 使用: bash infra/scripts/backup.sh
# 建议: cron 每天 03:00 执行
# ============================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/studio-javis/backups}"
REMOTE_DIR="${REMOTE_DIR:-}"  # NAS 挂载路径，留空则不同步
RETAIN_LOCAL=7
RETAIN_REMOTE=30

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="javis_${TIMESTAMP}.sql.gz"

echo "=== Studio Javis 数据库备份 ==="
echo "时间: $TIMESTAMP"
echo "目标: $BACKUP_DIR/$DUMP_FILE"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# pg_dump → gzip
echo "[1/3] 导出数据库..."
docker compose -f infra/compose/docker-compose.prod.yml exec -T postgres \
    pg_dump -U javis -d javis --no-owner --no-acl \
    | gzip > "$BACKUP_DIR/$DUMP_FILE"

FILE_SIZE=$(du -h "$BACKUP_DIR/$DUMP_FILE" | cut -f1)
echo "  备份大小: $FILE_SIZE"

# 清理本地旧备份（保留最近 N 天）
echo "[2/3] 清理本地旧备份（保留 $RETAIN_LOCAL 份）..."
ls -t "$BACKUP_DIR"/javis_*.sql.gz 2>/dev/null | tail -n +$((RETAIN_LOCAL + 1)) | xargs -r rm -v

# 同步到远端（NAS）
if [ -n "$REMOTE_DIR" ] && [ -d "$REMOTE_DIR" ]; then
    echo "[3/3] 同步到远端: $REMOTE_DIR"
    cp "$BACKUP_DIR/$DUMP_FILE" "$REMOTE_DIR/"
    # 清理远端旧备份
    ls -t "$REMOTE_DIR"/javis_*.sql.gz 2>/dev/null | tail -n +$((RETAIN_REMOTE + 1)) | xargs -r rm -v
else
    echo "[3/3] 跳过远端同步（未配置 REMOTE_DIR）"
fi

echo "=== 备份完成 ==="
