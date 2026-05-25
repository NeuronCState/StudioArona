#!/usr/bin/env bash
# =================================================================
# Studio Javis — Per-user Memory Backup & Restore
#
# Usage:
#   ./infra/scripts/backup-memory.sh backup <user_id>       # Backup single user
#   ./infra/scripts/backup-memory.sh backup-all              # Backup all users
#   ./infra/scripts/backup-memory.sh restore <user_id> <backup_file>
#   ./infra/scripts/backup-memory.sh list                    # List backups
# =================================================================
set -euo pipefail

JAVIS_USER_DATA_DIR="${JAVIS_USER_DATA_DIR:-$HOME/javis-data}"
BACKUP_DIR="${JAVIS_USER_DATA_DIR}/backups"
USERS_DIR="${JAVIS_USER_DATA_DIR}/users"

mkdir -p "$BACKUP_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
log()    { printf "${GREEN}[backup]${NC} %s\n" "$*"; }
err()    { printf "${RED}[backup]${NC} %s\n" "$*" >&2; }

cmd="${1:-help}"

case "$cmd" in
  backup)
    user_id="${2:-}"
    if [ -z "$user_id" ]; then
      err "Usage: $0 backup <user_id>"
      exit 1
    fi
    user_dir="${USERS_DIR}/${user_id}"
    if [ ! -d "$user_dir" ]; then
      err "User directory not found: $user_dir"
      exit 1
    fi
    ts=$(date +%Y%m%d-%H%M%S)
    backup_file="${BACKUP_DIR}/${user_id}-${ts}.tar.gz"
    tar -czf "$backup_file" -C "$USERS_DIR" "$user_id"
    log "Backup created: $backup_file"
    ls -lh "$backup_file"
    ;;

  backup-all)
    ts=$(date +%Y%m%d-%H%M%S)
    backup_file="${BACKUP_DIR}/all-users-${ts}.tar.gz"
    if [ ! -d "$USERS_DIR" ] || [ -z "$(ls -A "$USERS_DIR" 2>/dev/null)" ]; then
      err "No user data found in $USERS_DIR"
      exit 1
    fi
    tar -czf "$backup_file" -C "$JAVIS_USER_DATA_DIR" users
    user_count=$(ls -1 "$USERS_DIR" | wc -l | tr -d ' ')
    log "Full backup: $backup_file ($user_count users)"
    ls -lh "$backup_file"
    ;;

  restore)
    user_id="${2:-}"
    backup_file="${3:-}"
    if [ -z "$user_id" ] || [ -z "$backup_file" ]; then
      err "Usage: $0 restore <user_id> <backup_file>"
      exit 1
    fi
    if [ ! -f "$backup_file" ]; then
      err "Backup file not found: $backup_file"
      exit 1
    fi
    user_dir="${USERS_DIR}/${user_id}"
    if [ -d "$user_dir" ]; then
      warn "User directory exists, moving to .old"
      mv "$user_dir" "${user_dir}.old.$(date +%s)"
    fi
    tar -xzf "$backup_file" -C "$USERS_DIR"
    # Verify
    if [ -f "${user_dir}/memory.sqlite" ]; then
      tables=$(sqlite3 "${user_dir}/memory.sqlite" ".tables" 2>/dev/null || echo "")
      log "Restored ${user_id}: tables = $tables"
    else
      err "Restore failed: memory.sqlite not found after extraction"
      exit 1
    fi
    ;;

  list)
    log "Backups in $BACKUP_DIR:"
    ls -lh "$BACKUP_DIR" 2>/dev/null || echo "  (empty)"
    ;;

  *)
    echo "Studio Javis Memory Backup/Restore"
    echo ""
    echo "Usage:"
    echo "  $0 backup <user_id>        — Backup single user"
    echo "  $0 backup-all              — Backup all users"
    echo "  $0 restore <user_id> <file> — Restore user from backup"
    echo "  $0 list                    — List backups"
    ;;
esac
