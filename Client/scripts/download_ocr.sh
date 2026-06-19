#!/usr/bin/env bash
# download_ocr.sh — 下载 OCR 模型 (PaddleOCR-VL GGUF) 和 llama.cpp runtime
#
# 用法:
#   ./download_ocr.sh 1.6                    # 安装指定版本到 vendor/paddle-ocr/1.6/
#   ./download_ocr.sh 1.6 --platform darwin-arm64
#
# 新版本发布时:
#   1. 在下方 VERSIONS 数组里加一行 "X.Y|model_sha|mmproj_sha"
#   2. (可选) 设置环境变量 MODEL_URL_BASE 指向新仓库
#   3. 重跑: ./download_ocr.sh X.Y
#
# 输出布局 (版本子目录, 支持多版本共存 + 原子升级):
#   vendor/paddle-ocr/{version}/PaddleOCR-VL-{version}-GGUF.gguf
#   vendor/paddle-ocr/{version}/PaddleOCR-VL-{version}-GGUF-mmproj.gguf
#   vendor/paddle-ocr/current.json   # 标记当前激活版本
#
# 来源:
#   - 模型: PaddlePaddle/PaddleOCR-VL-{version}-GGUF (HuggingFace 官方)
#   - llama.cpp: 从 ggml-org/llama.cpp GitHub release 下载预编译 binary
#
# 国内加速:
#   默认用 hf-mirror.com, 设置 HF_ENDPOINT=https://huggingface.co 切回官方
#   llama.cpp GitHub release 用 ghfast.top 加速

set -euo pipefail

PLAT="${2:-darwin-arm64}"
OCR_VERSION="${1:-}"
HF_ENDPOINT="${HF_ENDPOINT:-https://hf-mirror.com}"
LLAMA_CPP_VERSION="${LLAMA_CPP_VERSION:-b6696}"

# ---------- 版本注册表 ----------
# 格式: version|model_sha256|mmproj_sha256
# 新版本发布时在这里加一行 (sha256 从 https://hf-mirror.com/PaddlePaddle/PaddleOCR-VL-X.Y-GGUF 复制)
# 或者从 modelscope 镜像 https://modelscope.cn/api/v1/models/PaddlePaddle/PaddleOCR-VL-X.Y-GGUF/repo/files 拉
VERSIONS=(
  "1.6|f3ae46ec885050acf4b3d31944431e1fd90d50664fb09126af4a3c050ba14ee8|204d757d7610d9b3faab10d506d69e5b244e32bf765e2bab2d0167e65e0a058a"
)

VENDOR_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL_ROOT="$VENDOR_ROOT/vendor/paddle-ocr"
LLAMA_DIR="$VENDOR_ROOT/vendor/llama.cpp/$PLAT"

# ---------- 参数校验 ----------
if [ -z "$OCR_VERSION" ]; then
  echo "[ocr-dl] ERROR: 必须指定版本号, e.g. ./download_ocr.sh 1.6" >&2
  echo "[ocr-dl] 已注册的版本:" >&2
  printf "  %s\n" "${VERSIONS[@]}" | cut -d'|' -f1 >&2
  exit 1
fi

# 在注册表里查版本
MODEL_SHA=""
MMPROJ_SHA=""
ENTRY=""
for v in "${VERSIONS[@]}"; do
  if [[ "$v" == "$OCR_VERSION|"* ]]; then
    ENTRY="$v"
    break
  fi
done
if [ -z "$ENTRY" ]; then
  echo "[ocr-dl] ERROR: 版本 $OCR_VERSION 未在 VERSIONS 注册表中" >&2
  echo "[ocr-dl] 已注册: $(printf '%s ' "${VERSIONS[@]}" | cut -d'|' -f1 | xargs)" >&2
  exit 1
fi
MODEL_SHA="$(echo "$ENTRY" | cut -d'|' -f2)"
MMPROJ_SHA="$(echo "$ENTRY" | cut -d'|' -f3)"

MODEL_DIR="$MODEL_ROOT/$OCR_VERSION"
mkdir -p "$MODEL_DIR" "$LLAMA_DIR"

echo "[ocr-dl] platform: $PLAT"
echo "[ocr-dl] version: $OCR_VERSION"
echo "[ocr-dl] HF endpoint: $HF_ENDPOINT"
echo "[ocr-dl] target: $MODEL_DIR"

MODEL_FILE="PaddleOCR-VL-${OCR_VERSION}-GGUF.gguf"
MMPROJ_FILE="PaddleOCR-VL-${OCR_VERSION}-GGUF-mmproj.gguf"
BASE_URL="$HF_ENDPOINT/PaddlePaddle/PaddleOCR-VL-${OCR_VERSION}-GGUF/resolve/main"

# ---------- sha256 工具 ----------
sha256_file() {
  if command -v shasum > /dev/null; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum > /dev/null; then
    sha256sum "$1" | awk '{print $1}'
  else
    echo ""
  fi
}

# ---------- 下载 + 校验 ----------
download_verify() {
  local file="$1"
  local expected_sha="$2"
  local out="$MODEL_DIR/$file"
  local url="$BASE_URL/$file"

  if [ -f "$out" ]; then
    local actual
    actual="$(sha256_file "$out")"
    if [ -n "$actual" ] && [ "$actual" = "$expected_sha" ]; then
      local size
      size="$(stat -f%z "$out" 2>/dev/null || stat -c%s "$out")"
      echo "[ocr-dl] ✓ $file (sha256 匹配, $size bytes)"
      return 0
    else
      echo "[ocr-dl] ✗ $file sha256 不匹配 (期望 $expected_sha, 实际 ${actual:-?}), 重下"
      rm -f "$out"
    fi
  fi

  echo "[ocr-dl] ↓ $file ..."
  if command -v curl > /dev/null; then
    curl -L --retry 3 --retry-delay 5 --progress-bar -o "$out.tmp" "$url"
  elif command -v wget > /dev/null; then
    wget -O "$out.tmp" "$url"
  else
    echo "[ocr-dl] ERROR: curl or wget required" >&2
    return 1
  fi

  local new_actual
  new_actual="$(sha256_file "$out.tmp")"
  if [ -n "$new_actual" ] && [ "$new_actual" != "$expected_sha" ]; then
    rm -f "$out.tmp"
    echo "[ocr-dl] ERROR: 下载后 sha256 不匹配" >&2
    echo "  期望: $expected_sha" >&2
    echo "  实际: $new_actual" >&2
    return 1
  fi
  mv "$out.tmp" "$out"
  echo "[ocr-dl] ✓ $file (下载完成, sha256 匹配)"
}

download_verify "$MODEL_FILE" "$MODEL_SHA"
download_verify "$MMPROJ_FILE" "$MMPROJ_SHA"

# ---------- 写 current.json (除非指定 NO_ACTIVATE) ----------
CURRENT_JSON="$MODEL_ROOT/current.json"
if [ "${NO_ACTIVATE:-0}" != "1" ]; then
  cat > "$CURRENT_JSON.tmp" <<EOF
{
  "version": "$OCR_VERSION",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "model_file": "$MODEL_FILE",
  "mmproj_file": "$MMPROJ_FILE",
  "model_sha256": "$MODEL_SHA",
  "mmproj_sha256": "$MMPROJ_SHA",
  "source": "$BASE_URL"
}
EOF
  mv "$CURRENT_JSON.tmp" "$CURRENT_JSON"
  echo "[ocr-dl] ✓ current.json → $OCR_VERSION"
fi

# ---------- 旧平铺路径迁移 ----------
# 老版本 (下载脚本第一次改版之前) 把 gguf 直接放在 vendor/paddle-ocr/ 下
# 这里检测到旧文件就挪到子目录 (幂等, 旧位置没有就不动)
LEGACY_MODEL="$MODEL_ROOT/PaddleOCR-VL-${OCR_VERSION}-GGUF.gguf"
LEGACY_MMPROJ="$MODEL_ROOT/PaddleOCR-VL-${OCR_VERSION}-GGUF-mmproj.gguf"
if [ -f "$LEGACY_MODEL" ] && [ ! -f "$MODEL_DIR/$MODEL_FILE" ]; then
  mv "$LEGACY_MODEL" "$MODEL_DIR/$MODEL_FILE"
  echo "[ocr-dl] 迁移: 旧平铺 model → $MODEL_DIR/$MODEL_FILE"
fi
if [ -f "$LEGACY_MMPROJ" ] && [ ! -f "$MODEL_DIR/$MMPROJ_FILE" ]; then
  mv "$LEGACY_MMPROJ" "$MODEL_DIR/$MMPROJ_FILE"
  echo "[ocr-dl] 迁移: 旧平铺 mmproj → $MODEL_DIR/$MMPROJ_FILE"
fi

# ---------- 下载 llama.cpp 预编译 binary ----------
download_llama_cpp() {
  case "$PLAT" in
    darwin-arm64)
      local base_url="https://ghfast.top/https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/llama-${LLAMA_CPP_VERSION}-bin-macos-arm64.zip"
      local zip_file="$LLAMA_DIR/llama.zip"
      if [ -f "$LLAMA_DIR/llama-server" ]; then
        echo "[ocr-dl] ✓ llama-server 已存在"
        return 0
      fi
      echo "[ocr-dl] ↓ llama.cpp macOS arm64 from GitHub release ..."
      curl -L --retry 3 -o "$zip_file" "$base_url"
      cd "$LLAMA_DIR" && unzip -oq "$zip_file" && rm -f "$zip_file"
      cd "$LLAMA_DIR/build/bin" 2>/dev/null && {
        find . -maxdepth 1 -type f \( -name "llama-server" -o -name "*.dylib" \) -exec mv {} "$LLAMA_DIR/" \;
        cd "$LLAMA_DIR" && rm -rf build
      }
      ;;
    linux-x64)
      local base_url="https://ghfast.top/https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/llama-${LLAMA_CPP_VERSION}-bin-linux-x64.zip"
      local zip_file="$LLAMA_DIR/llama.zip"
      if [ -f "$LLAMA_DIR/llama-server" ]; then
        echo "[ocr-dl] ✓ llama-server 已存在"
        return 0
      fi
      echo "[ocr-dl] ↓ llama.cpp Linux x64 from GitHub release ..."
      curl -L --retry 3 -o "$zip_file" "$base_url"
      cd "$LLAMA_DIR" && unzip -oq "$zip_file" && rm -f "$zip_file"
      cd "$LLAMA_DIR/build/bin" 2>/dev/null && {
        find . -maxdepth 1 -type f \( -name "llama-server" -o -name "*.so*" \) -exec mv {} "$LLAMA_DIR/" \;
        cd "$LLAMA_DIR" && rm -rf build
      }
      ;;
    windows-x64)
      local base_url="https://ghfast.top/https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/llama-${LLAMA_CPP_VERSION}-bin-win-cuda-x64.zip"
      local zip_file="$LLAMA_DIR/llama.zip"
      if [ -f "$LLAMA_DIR/llama-server.exe" ]; then
        echo "[ocr-dl] ✓ llama-server.exe 已存在"
        return 0
      fi
      echo "[ocr-dl] ↓ llama.cpp Windows x64 from GitHub release ..."
      curl -L --retry 3 -o "$zip_file" "$base_url"
      cd "$LLAMA_DIR" && unzip -oq "$zip_file" && rm -f "$zip_file"
      cd "$LLAMA_DIR/build/bin" 2>/dev/null && {
        find . -maxdepth 1 -type f \( -name "llama-server.exe" -o -name "*.dll" \) -exec mv {} "$LLAMA_DIR/" \;
        cd "$LLAMA_DIR" && rm -rf build
      }
      ;;
    *)
      echo "[ocr-dl] ERROR: unsupported platform: $PLAT" >&2
      return 1
      ;;
  esac
}

download_llama_cpp

# ---------- 验证 ----------
echo ""
echo "[ocr-dl] ✓ Done. Verifying:"
ls -lh "$MODEL_DIR"/*.gguf 2>&1
echo ""
ls "$LLAMA_DIR"/llama-server* 2>&1

echo ""
echo "[ocr-dl] Usage:"
echo "  当前激活版本见: $CURRENT_JSON"
echo "  Tauri 桌面应用: 自动检测 vendor/{version}/, 首次 OCR 调用时懒加载"
echo "  Web 模式: 直接 fetch localhost:8083"
