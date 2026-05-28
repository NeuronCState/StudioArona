#!/usr/bin/env bash
# Ensure Python venv is healthy — auto-repair if corrupted.
# Common cause: Python version upgrade breaks C extensions in .venv.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

check_venv() {
  uv run python -c "import sqlalchemy" 2>/dev/null
}

if check_venv; then
  exit 0
fi

echo "[venv] corrupted — running uv sync to repair..."
uv sync --all-packages

if check_venv; then
  echo "[venv] repaired successfully"
else
  echo "[venv] FATAL: repair failed — try 'make clean && make bootstrap'"
  exit 1
fi
