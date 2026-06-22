#!/usr/bin/env bash
# build.sh — Build SonettoHere venv + source tarballs for Tauri bundling.
#
# Output:
#   - venv.tar.gz: stripped Python venv (~100MB gzip)
#   - sonetto-source.tar.gz: SonettoHere source code (~1MB)
#
# These are picked up by tauri.conf.json `resources` field and embedded
# into the .dmg / .msi / .deb. On first launch, the Tauri Rust code
# extracts them to `app_data_dir()/sonetto/` and spawns the venv Python
# directly (no `uv pip install` needed at runtime).
#
# Usage:
#   cd Client/tauri/bundle
#   ./build.sh
#
# CI: invoked from .github/workflows/release.yml per-platform job.
set -euo pipefail

# Paths — relative to Client/
CLIENT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VENV_DIR="$CLIENT_ROOT/.venv-sonetto"
SONETTO_SRC="$CLIENT_ROOT/services/sonetto"
OUT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[bundle] CLIENT_ROOT=$CLIENT_ROOT"
echo "[bundle] VENV_DIR=$VENV_DIR"
echo "[bundle] OUT_DIR=$OUT_DIR"

# Sanity checks
if [ ! -d "$VENV_DIR" ]; then
  echo "ERROR: venv not found at $VENV_DIR"
  echo "  Create it: cd $CLIENT_ROOT && uv venv --python ~/.local/bin/python3.12 .venv-sonetto"
  echo "  Install:   uv pip install --python $VENV_DIR/bin/python3 -r $SONETTO_SRC/requirements.txt -r $CLIENT_ROOT/services/ocr/requirements.txt"
  exit 1
fi

if [ ! -f "$VENV_DIR/bin/python3" ]; then
  echo "ERROR: venv is broken (no bin/python3)"
  exit 1
fi

if [ ! -f "$SONETTO_SRC/api/server.py" ]; then
  echo "ERROR: SonettoHere source not found at $SONETTO_SRC/api/server.py"
  exit 1
fi

# === Strip venv (remove caches + dist-info metadata) ===
echo "[bundle] stripping venv..."
# Remove __pycache__ dirs and .pyc files
find "$VENV_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$VENV_DIR" -name "*.pyc" -delete 2>/dev/null || true
find "$VENV_DIR" -name "*.pyo" -delete 2>/dev/null || true
# Remove dist-info dirs (METADATA + RECORD, not needed at runtime, saves ~10-20MB)
find "$VENV_DIR" -path "*.dist-info" -type d -exec rm -rf {} + 2>/dev/null || true
# Remove test/docs for big packages (optional, can be aggressive)
# find "$VENV_DIR/lib/python3.12/site-packages" -path "*/tests" -type d -exec rm -rf {} + 2>/dev/null || true
# find "$VENV_DIR/lib/python3.12/site-packages" -path "*/test" -name "*.py" -delete 2>/dev/null || true

# Verify venv still works
echo "[bundle] verifying stripped venv..."
"$VENV_DIR/bin/python3" -c "import langchain, fastapi, uvicorn; print(f'  langchain {langchain.__version__}')" || {
  echo "ERROR: stripped venv is broken"
  exit 1
}

# === Tar venv ===
echo "[bundle] creating venv.tar.gz..."
# -C so paths are relative (no /Users/.../ in the tar)
tar -czf "$OUT_DIR/venv.tar.gz" -C "$CLIENT_ROOT" .venv-sonetto

# === Tar SonettoHere source ===
echo "[bundle] creating sonetto-source.tar.gz..."
# Extract layout must match the Rust code in src/lib.rs:
#   spawn_sonetto() resolves: <app_data_dir>/sonetto/services/sonetto/api/server.py
# So we wrap with services/ to produce paths like "services/sonetto/api/server.py"
tar -czf "$OUT_DIR/sonetto-source.tar.gz" -C "$CLIENT_ROOT" services/sonetto

# === Report ===
echo "[bundle] done:"
ls -lh "$OUT_DIR/venv.tar.gz" "$OUT_DIR/sonetto-source.tar.gz"
echo "[bundle] total:"
du -sh "$OUT_DIR/venv.tar.gz" "$OUT_DIR/sonetto-source.tar.gz"
