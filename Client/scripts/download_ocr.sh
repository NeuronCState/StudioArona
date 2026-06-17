#!/usr/bin/env bash
# download_ocr.sh — 下载 OCR 模型 (PaddleOCR-VL-1.6 GGUF) 和 llama.cpp runtime
#
# 用法:
#   ./download_ocr.sh                    # macOS (darwin-arm64)
#   ./download_ocr.sh linux-x64          # Linux
#   ./download_ocr.sh windows-x64        # Windows
#
# 输出:
#   vendor/paddle-ocr/PaddleOCR-VL-1.6-GGUF.gguf          (892M)
#   vendor/paddle-ocr/PaddleOCR-VL-1.6-GGUF-mmproj.gguf   (841M)
#   vendor/llama.cpp/{plat}/llama-server (+ .so/.dll/.dylib 平台依赖)
#
# 来源:
#   - 模型: PaddlePaddle/PaddleOCR-VL-1.6-GGUF (HuggingFace 官方)
#   - llama.cpp: 从 ggml-org/llama.cpp GitHub release 下载预编译 binary
#
# 国内加速:
#   默认用 hf-mirror.com (HuggingFace 镜像), 设置 HF_ENDPOINT=https://huggingface.co 切回官方
#   llama.cpp GitHub release 用 ghfast.top 加速

set -e

PLAT="${1:-darwin-arm64}"
HF_ENDPOINT="${HF_ENDPOINT:-https://hf-mirror.com}"
LLAMA_CPP_VERSION="${LLAMA_CPP_VERSION:-b6696}"

VENDOR_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL_DIR="$VENDOR_ROOT/vendor/paddle-ocr"
LLAMA_DIR="$VENDOR_ROOT/vendor/llama.cpp/$PLAT"

mkdir -p "$MODEL_DIR" "$LLAMA_DIR"

echo "[ocr-dl] platform: $PLAT"
echo "[ocr-dl] HF endpoint: $HF_ENDPOINT"

# ---------- 1. 下载 PaddleOCR-VL-1.6 GGUF ----------
download_model() {
  local file="$1"
  local url="$HF_ENDPOINT/PaddlePaddle/PaddleOCR-VL-1.6-GGUF/resolve/main/$file"
  local out="$MODEL_DIR/$file"

  if [ -f "$out" ] && [ "$(stat -f%z "$out" 2>/dev/null || stat -c%s "$out")" -gt 1000000 ]; then
    echo "[ocr-dl] ✓ $file (already exists)"
    return 0
  fi

  echo "[ocr-dl] ↓ $file ..."
  if command -v curl > /dev/null; then
    curl -L --retry 3 --retry-delay 5 -o "$out" "$url"
  elif command -v wget > /dev/null; then
    wget -O "$out" "$url"
  else
    echo "[ocr-dl] ERROR: curl or wget required" >&2
    return 1
  fi
}

download_model "PaddleOCR-VL-1.6-GGUF.gguf"
download_model "PaddleOCR-VL-1.6-GGUF-mmproj.gguf"

# ---------- 2. 下载 llama.cpp 预编译 binary ----------
download_llama_cpp() {
  case "$PLAT" in
    darwin-arm64)
      # 官方 macOS release 没有 universal binary, 我们用 ghfast.top 镜像 GitHub
      local base_url="https://ghfast.top/https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/llama-${LLAMA_CPP_VERSION}-bin-macos-arm64.zip"
      local zip_file="$LLAMA_DIR/llama.zip"
      echo "[ocr-dl] ↓ llama.cpp macOS arm64 from GitHub release ..."
      curl -L --retry 3 -o "$zip_file" "$base_url"
      echo "[ocr-dl] unzip ..."
      cd "$LLAMA_DIR" && unzip -oq "$zip_file" && rm -f "$zip_file"
      cd "$LLAMA_DIR/build/bin" 2>/dev/null && {
        # 移动 binary 到 LLAMA_DIR 顶层, 保留 .dylib 在同目录
        find . -maxdepth 1 -type f \( -name "llama-server" -o -name "*.dylib" \) -exec mv {} "$LLAMA_DIR/" \;
        cd "$LLAMA_DIR" && rm -rf build
      }
      ;;
    linux-x64)
      local base_url="https://ghfast.top/https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/llama-${LLAMA_CPP_VERSION}-bin-linux-x64.zip"
      local zip_file="$LLAMA_DIR/llama.zip"
      echo "[ocr-dl] ↓ llama.cpp Linux x64 from GitHub release ..."
      curl -L --retry 3 -o "$zip_file" "$base_url"
      echo "[ocr-dl] unzip ..."
      cd "$LLAMA_DIR" && unzip -oq "$zip_file" && rm -f "$zip_file"
      cd "$LLAMA_DIR/build/bin" 2>/dev/null && {
        find . -maxdepth 1 -type f \( -name "llama-server" -o -name "*.so*" \) -exec mv {} "$LLAMA_DIR/" \;
        cd "$LLAMA_DIR" && rm -rf build
      }
      ;;
    windows-x64)
      local base_url="https://ghfast.top/https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/llama-${LLAMA_CPP_VERSION}-bin-win-cuda-x64.zip"
      local zip_file="$LLAMA_DIR/llama.zip"
      echo "[ocr-dl] ↓ llama.cpp Windows x64 from GitHub release ..."
      curl -L --retry 3 -o "$zip_file" "$base_url"
      echo "[ocr-dl] unzip ..."
      cd "$LLAMA_DIR" && unzip -oq "$zip_file" && rm -f "$zip_file"
      cd "$LLAMA_DIR/build/bin" 2>/dev/null && {
        find . -maxdepth 1 -type f \( -name "llama-server.exe" -o -name "*.dll" \) -exec mv {} "$LLAMA_DIR/" \;
        cd "$LLAMA_DIR" && rm -rf build
      }
      ;;
    *)
      echo "[ocr-dl] ERROR: unsupported platform: $PLAT" >&2
      echo "  Supported: darwin-arm64, linux-x64, windows-x64" >&2
      return 1
      ;;
  esac
}

download_llama_cpp

# ---------- 3. 验证 ----------
echo ""
echo "[ocr-dl] ✓ Done. Verifying:"
ls -lh "$MODEL_DIR"/*.gguf 2>&1
echo ""
ls "$LLAMA_DIR"/llama-server* 2>&1

echo ""
echo "[ocr-dl] Usage:"
echo "  Tauri 桌面应用: 自动检测 vendor/, 首次 OCR 调用时懒加载"
echo "  Web 模式 (pnpm dev:ocr): 直接 fetch localhost:8083"