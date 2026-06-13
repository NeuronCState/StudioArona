#!/bin/bash
# Download llama.cpp binaries for all platforms
# Usage: ./scripts/download-llama-cpp.sh [version]
# Default version: b9624 (latest stable)

set -e

VERSION="${1:-b9624}"
VENDOR_DIR="$(cd "$(dirname "$0")/.." && pwd)/vendor/llama.cpp"
BASE_URL="https://github.com/ggml-org/llama.cpp/releases/download"
MIRROR="https://ghfast.top"

echo "Downloading llama.cpp ${VERSION}..."

# macOS ARM64
echo "  → darwin-arm64..."
curl -sL "${MIRROR}/${BASE_URL}/${VERSION}/llama-${VERSION}-bin-macos-arm64.tar.gz" -o /tmp/llama-darwin.tar.gz
tar -xzf /tmp/llama-darwin.tar.gz -C "${VENDOR_DIR}/darwin-arm64/" --strip-components=1
rm -f /tmp/llama-darwin.tar.gz

# Linux x64
echo "  → linux-x64..."
curl -sL "${MIRROR}/${BASE_URL}/${VERSION}/llama-${VERSION}-bin-ubuntu-x64.tar.gz" -o /tmp/llama-linux.tar.gz
tar -xzf /tmp/llama-linux.tar.gz -C "${VENDOR_DIR}/linux-x64/" --strip-components=1
rm -f /tmp/llama-linux.tar.gz

# Windows x64 (CPU only)
echo "  → windows-x64..."
curl -sL "${MIRROR}/${BASE_URL}/${VERSION}/llama-${VERSION}-bin-win-cpu-x64.zip" -o /tmp/llama-windows.zip
unzip -qo /tmp/llama-windows.zip -d "${VENDOR_DIR}/windows-x64/"
rm -f /tmp/llama-windows.zip

echo "Done! Binaries at ${VENDOR_DIR}"
ls -la "${VENDOR_DIR}"/*/llama-server 2>/dev/null || echo "  (llama-server not found in some platforms)"
