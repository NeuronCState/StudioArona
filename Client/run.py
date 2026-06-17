#!/usr/bin/env python3
"""StudioArona Client — 启动脚本.

用 python3.12 (SonettoHere requires-python >= 3.11, 选 3.12 性能更好 + 原生 X|None 语法).
如果没有 python3.12, 自动 fallback 到 PATH 里的 python3, 但建议先 uv python install 3.12.

启动顺序:
  1. SonettoHere Python venv (自动建 + 装依赖, 首次 30s)
  2. SonettoHere uvicorn (端口 8081)
  3. OCR 服务 (Web 模式, 端口 8083, 用户进 /ocr 才用, 但这里先启好方便 dev)
  4. Vite dev server (端口 5173, 前台)

OCR 资源 (vendor/paddle-ocr/*.gguf + vendor/llama.cpp/{plat}/*) 不存在会自动跑 scripts/download_ocr.sh 下载 (1.85G, 慢但一次).

用法:
    python3 run.py                # 全套: venv + SonettoHere + OCR + Vite
    python3 run.py --no-sonetto   # 不启 SonettoHere (纯前端 dev)
    python3 run.py --no-ocr       # 不启 OCR
    python3 run.py --download-ocr # 先下 OCR 资源再启
    python3 run.py --stop         # kill 所有子进程
    python3 run.py --logs         # tail 所有 log

依赖:
    - uv (首次建 venv + 装 deps, ~/.local/bin/uv)
    - python3.12 (SonettoHere requires-python >= 3.11)
    - node/pnpm (Vite)
"""
from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"
OCR_DIR = ROOT / "services" / "ocr"
SONETTO_SRC_PARENT = ROOT / ".sonetto-run"
SONETTO_SRC_LINK = SONETTO_SRC_PARENT / "src"
SONETTO_REQUIREMENTS = Path("/Users/zhangxuanning/Downloads/SonettoHere-main/requirements.txt")
VENV_DIR = ROOT / ".venv-sonetto"
LOG_DIR = ROOT / ".run-logs"
LOG_DIR.mkdir(exist_ok=True)

UV_BIN = Path.home() / ".local" / "bin" / "uv"
PY_BIN = Path.home() / ".local" / "bin" / "python3.12"
PY_VERSION = "3.12"  # 统一项目 Python 版本 (SonettoHere requires-python >= 3.11)

OCR_VENDOR_DIR = ROOT / "vendor" / "paddle-ocr"
OCR_LLAMA_DIR = ROOT / "vendor" / "llama.cpp"


def log(msg: str) -> None:
    print(f"[client-run] {msg}", flush=True)


def get_platform() -> str:
    system = platform.system().lower()
    machine = platform.machine().lower()
    if system == "darwin" and machine == "arm64":
        return "darwin-arm64"
    if system == "linux" and machine == "x86_64":
        return "linux-x64"
    if system == "windows" and machine == "x86_64":
        return "windows-x64"
    raise RuntimeError(f"unsupported platform: {system}/{machine}")


def ensure_venv() -> None:
    """Build venv + install SonettoHere + OCR deps."""
    if VENV_DIR.exists() and (VENV_DIR / "bin" / "python3").exists():
        log(f"venv exists: {VENV_DIR}")
        return

    if not UV_BIN.exists():
        log(f"ERROR: uv not found at {UV_BIN}, install: curl -LsSf https://astral.sh/uv/install.sh | sh")
        sys.exit(1)

    if not PY_BIN.exists():
        log(f"Python {PY_VERSION} not at {PY_BIN}, fallback to uv auto-select (run: uv python install {PY_VERSION})")
        py_arg = PY_VERSION
    else:
        py_arg = str(PY_BIN)

    log(f"creating venv (Python {PY_VERSION}) ...")
    subprocess.run([str(UV_BIN), "venv", "--python", py_arg, str(VENV_DIR)], check=True)

    log("installing SonettoHere deps (~30s) ...")
    if not SONETTO_REQUIREMENTS.exists():
        log(f"ERROR: SonettoHere requirements.txt not found at {SONETTO_REQUIREMENTS}")
        log("Clone from GitHub: gh repo clone Miso2233/SonettoHere ~/Downloads/SonettoHere-main")
        sys.exit(1)
    subprocess.run([
        str(UV_BIN), "pip", "install", "--python", str(VENV_DIR / "bin" / "python3"),
        "-i", "https://pypi.tuna.tsinghua.edu.cn/simple/",
        "-r", str(SONETTO_REQUIREMENTS),
    ], check=True)

    log("installing OCR extra deps (Quartz macOS PDF->image) ...")
    subprocess.run([
        str(UV_BIN), "pip", "install", "--python", str(VENV_DIR / "bin" / "python3"),
        "-i", "https://pypi.tuna.tsinghua.edu.cn/simple/",
        "pyobjc-framework-Quartz",
    ], check=True)

    log("venv ready")


def ensure_sonetto_symlink() -> None:
    if SONETTO_SRC_LINK.exists():
        return
    SONETTO_SRC_PARENT.mkdir(parents=True, exist_ok=True)
    SONETTO_SRC_LINK.symlink_to(SONETTO_REQUIREMENTS.parent)
    log(f"SonettoHere src symlink: {SONETTO_SRC_LINK} -> {SONETTO_REQUIREMENTS.parent}")


def ensure_ocr_vendor() -> None:
    """Run scripts/download_ocr.sh if vendor/ is missing."""
    plat = get_platform()
    model_ok = (OCR_VENDOR_DIR / "PaddleOCR-VL-1.6-GGUF.gguf").exists()
    mmproj_ok = (OCR_VENDOR_DIR / "PaddleOCR-VL-1.6-GGUF-mmproj.gguf").exists()
    llama_ok = (OCR_LLAMA_DIR / plat / "llama-server").exists() or (OCR_LLAMA_DIR / plat / "llama-server.exe").exists()
    if model_ok and mmproj_ok and llama_ok:
        log(f"OCR vendor OK ({plat})")
        return

    log("OCR vendor missing, running scripts/download_ocr.sh (1.85G, 5-30 min) ...")
    download_script = ROOT / "scripts" / "download_ocr.sh"
    if not download_script.exists():
        log(f"ERROR: {download_script} not found")
        sys.exit(1)
    subprocess.run(["bash", str(download_script), plat], check=True)
    log("OCR vendor downloaded")


def spawn_sonetto() -> tuple[subprocess.Popen, Path]:
    """Spawn SonettoHere uvicorn in background."""
    log_path = LOG_DIR / "sonetto.log"
    log(f"spawning SonettoHere (8081) -> {log_path}")
    p = subprocess.Popen(
        [str(VENV_DIR / "bin" / "python"), "-m", "uvicorn", "api.server:create_app",
         "--factory", "--host", "127.0.0.1", "--port", "8081"],
        cwd=SONETTO_SRC_PARENT,
        env={**os.environ, "PYTHONPATH": "src", "PYTHONUNBUFFERED": "1"},
        stdout=open(log_path, "ab"),
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    log(f"  pid={p.pid}")
    return p, log_path


def spawn_ocr() -> tuple[subprocess.Popen, Path]:
    """Spawn OCR fastapi in background (Web dev mode only)."""
    log_path = LOG_DIR / "ocr.log"
    log(f"spawning OCR (8083) -> {log_path}")
    p = subprocess.Popen(
        [str(VENV_DIR / "bin" / "python"), "-m", "uvicorn", "main:app",
         "--host", "127.0.0.1", "--port", "8083"],
        cwd=OCR_DIR,
        env={**os.environ, "OCR_PORT": "8083", "OCR_LLAMA_PORT": "8082", "PYTHONUNBUFFERED": "1"},
        stdout=open(log_path, "ab"),
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    log(f"  pid={p.pid}")
    return p, log_path


def spawn_vite() -> None:
    """Spawn Vite dev server in foreground (Ctrl-C to exit)."""
    log("spawning Vite dev (5173) ...")
    log("  URL: http://localhost:5173")
    log("  Ctrl-C to exit (auto-cleanup child processes)")
    try:
        subprocess.run(["pnpm", "dev"], cwd=WEB_DIR)
    except KeyboardInterrupt:
        log("\nreceived Ctrl-C, exiting")


def wait_health(url: str, label: str, timeout: int = 30) -> None:
    for _ in range(timeout):
        try:
            r = urllib.request.urlopen(url, timeout=2)
            if r.status == 200:
                log(f"{label} healthy ({url})")
                return
        except Exception:
            pass
        time.sleep(1)
    log(f"{label} not ready in {timeout}s, continuing (check logs)")


def kill_all() -> None:
    """Kill SonettoHere + OCR + Vite."""
    for pattern in ["api.server:create_app", "main:app.*8083", "vite", "pnpm dev"]:
        subprocess.run(["pkill", "-f", pattern], check=False)
    log("killed sonetto + ocr + vite")


def tail_logs() -> None:
    logs = sorted(LOG_DIR.glob("*.log"))
    if not logs:
        log("no logs yet, run once first")
        return
    subprocess.run(["tail", "-f"] + [str(p) for p in logs])


def main() -> None:
    parser = argparse.ArgumentParser(description="StudioArona Client runner")
    parser.add_argument("--no-sonetto", action="store_true", help="don't spawn SonettoHere")
    parser.add_argument("--no-ocr", action="store_true", help="don't spawn OCR")
    parser.add_argument("--download-ocr", action="store_true", help="download OCR resources first")
    parser.add_argument("--no-vite", action="store_true", help="don't spawn Vite (backend only)")
    parser.add_argument("--stop", action="store_true", help="kill all child processes")
    parser.add_argument("--logs", action="store_true", help="tail logs")
    args = parser.parse_args()

    if args.stop:
        kill_all()
        return
    if args.logs:
        tail_logs()
        return

    log(f"platform: {get_platform()}")

    # 1. venv + symlink (SonettoHere shared venv)
    ensure_venv()
    ensure_sonetto_symlink()

    # 2. OCR resources (not the OCR process itself, just downloads)
    if args.download_ocr:
        ensure_ocr_vendor()
    elif not args.no_ocr:
        try:
            ensure_ocr_vendor()
        except SystemExit:
            log("")
            log("OCR resources missing, run `python3 run.py --download-ocr` to download")
            log("or pass --no-ocr to skip")
            return

    # 3. spawn SonettoHere
    if not args.no_sonetto:
        spawn_sonetto()
        wait_health("http://127.0.0.1:8081/api/health", "SonettoHere")

    # 4. spawn OCR (Web dev mode; Tauri desktop mode spawns itself, not relying on this)
    if not args.no_ocr:
        try:
            spawn_ocr()
            wait_health("http://127.0.0.1:8083/health", "OCR")
        except Exception as e:
            log(f"OCR spawn failed: {e} (Tauri desktop mode can ignore this)")

    # 5. Vite foreground
    if not args.no_vite:
        try:
            spawn_vite()
        finally:
            log("cleaning up child processes ...")
            kill_all()


if __name__ == "__main__":
    main()