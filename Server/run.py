#!/usr/bin/env python3
"""StudioArona Server — 启动脚本.

启动 PG/Redis (docker compose) + Rust center daemon (cargo run) + 可选 OCR FastAPI.

用法:
    python3 run.py                # 全套: docker up + cargo run
    python3 run.py --no-docker    # 不启 docker (假设 PG/Redis 已起)
    python3 run.py --build        # 只 build, 不 run
    python3 run.py --stop         # 停 docker + kill center + kill ocr
    python3 run.py --logs         # tail center 日志
    python3 run.py --daemon       # background 模式 (log -> .run-logs/center.log)
    python3 run.py --ocr          # 同时启 Server 端 OCR (端口 8083, 跟 Client 互斥)
    python3 run.py --download-ocr # 下 OCR 资源到 Server/vendor/

依赖:
    - docker (启 PG/Redis)
    - rust/cargo (启 center)
    - python3.12 (脚本本身, 跟 Client 统一版本, 装在 Server/.venv-runner)
    - OCR FastAPI 在 Server/services/ocr/main.py (PaddleOCR-VL-1.6, 跟 Client 独立副本)
    - OCR 资源在 Server/vendor/ (.gitignore 排除, --download-ocr 下载)
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CENTER_DIR = ROOT / "center"
OCR_DIR = ROOT / "services" / "ocr"
OCR_VENDOR_DIR = ROOT / "vendor" / "paddle-ocr"
OCR_LLAMA_DIR = ROOT / "vendor" / "llama.cpp"
OCR_DOWNLOAD_SCRIPT = ROOT / "scripts" / "download_ocr.sh"
OCR_VENV = ROOT / ".venv-ocr"  # Server 端 OCR 独立 venv (跟 .venv-runner 分开)
COMPOSE_FILE = ROOT / "infra" / "compose" / "docker-compose.yml"
LOG_DIR = ROOT / ".run-logs"
VENV_DIR = ROOT / ".venv-runner"
PY_VERSION = "3.12"
LOG_DIR.mkdir(exist_ok=True)


def ensure_runner_venv() -> Path:
    """确保 Server/.venv-runner 存在 (首次自动建 + 装基础 deps).
    跟 Client/.venv-sonetto 独立 — Server 没有 SonettoHere/OCR, 不依赖那些大包.
    """
    if VENV_DIR.exists() and (VENV_DIR / "bin" / "python3").exists():
        return VENV_DIR / "bin" / "python3"

    log("creating Server runner venv (Python 3.12) ...")
    uv = Path.home() / ".local" / "bin" / "uv"
    py_bin = Path.home() / ".local" / "bin" / "python3.12"
    py_arg = str(py_bin) if py_bin.exists() else PY_VERSION

    if not uv.exists():
        log(f"ERROR: uv not at {uv}, install: curl -LsSf https://astral.sh/uv/install.sh | sh")
        sys.exit(1)

    subprocess.run([str(uv), "venv", "--python", py_arg, str(VENV_DIR)], check=True)

    # 装基础 deps (Server 端可能用到的工具)
    log("installing runner deps ...")
    subprocess.run([
        str(uv), "pip", "install", "--python", str(VENV_DIR / "bin" / "python3"),
        "-i", "https://pypi.tuna.tsinghua.edu.cn/simple/",
        "httpx",  # 给未来 SSRF / DB query 用
        "pyyaml",
        "rich",  # 给未来漂亮输出用
    ], check=True)
    log("runner venv ready")
    return VENV_DIR / "bin" / "python3"


def ensure_ocr_venv() -> Path:
    """Build Server/.venv-ocr (独立 venv, 装 OCR FastAPI + llama-server 通信 deps).

    跟 .venv-runner 完全隔离 — runner 轻量 (httpx + pyyaml + rich), ocr 重 (fastapi + uvicorn + httpx + pillow + pyobjc).
    """
    if OCR_VENV.exists() and (OCR_VENV / "bin" / "python3").exists():
        return OCR_VENV / "bin" / "python3"

    log("creating Server OCR venv (Python 3.12) ...")
    uv = Path.home() / ".local" / "bin" / "uv"
    py_bin = Path.home() / ".local" / "bin" / "python3.12"
    py_arg = str(py_bin) if py_bin.exists() else PY_VERSION

    if not uv.exists():
        log(f"ERROR: uv not at {uv}")
        sys.exit(1)

    subprocess.run([str(uv), "venv", "--python", py_arg, str(OCR_VENV)], check=True)

    log("installing OCR deps ...")
    subprocess.run([
        str(uv), "pip", "install", "--python", str(OCR_VENV / "bin" / "python3"),
        "-i", "https://pypi.tuna.tsinghua.edu.cn/simple/",
        "fastapi", "uvicorn[standard]", "httpx", "pillow", "pydantic",
        "python-multipart",  # fastapi Form 上传需要
        "pyobjc-framework-Quartz",  # macOS PDF→image
    ], check=True)
    log("OCR venv ready")
    return OCR_VENV / "bin" / "python3"


def ensure_ocr_vendor() -> None:
    """检查 Server/vendor/ 是否齐 (1.85G), 缺则跑 download_ocr.sh."""
    plat = "darwin-arm64"  # Server OCR 当前只 macOS 跑; Linux/Windows 用 --download-ocr 时 download_ocr.sh 会自动选
    if sys.platform == "linux":
        plat = "linux-x64"
    elif sys.platform == "win32":
        plat = "windows-x64"

    model_ok = (OCR_VENDOR_DIR / "PaddleOCR-VL-1.6-GGUF.gguf").exists()
    mmproj_ok = (OCR_VENDOR_DIR / "PaddleOCR-VL-1.6-GGUF-mmproj.gguf").exists()
    llama_ok = (OCR_LLAMA_DIR / plat / "llama-server").exists() or (OCR_LLAMA_DIR / plat / "llama-server.exe").exists()

    if model_ok and mmproj_ok and llama_ok:
        log(f"OCR vendor OK ({plat})")
        return

    log("OCR vendor missing, downloading ...")
    if not OCR_DOWNLOAD_SCRIPT.exists():
        log(f"ERROR: {OCR_DOWNLOAD_SCRIPT} not found")
        sys.exit(1)
    subprocess.run(["bash", str(OCR_DOWNLOAD_SCRIPT), plat], check=True)


def spawn_ocr() -> subprocess.Popen:
    """Spawn Server 端 OCR FastAPI 后台 (端口 8083, 跟 Client 互斥)."""
    log_path = LOG_DIR / "ocr.log"
    log(f"spawning Server OCR (8083) -> {log_path}")
    python_bin = ensure_ocr_venv()
    p = subprocess.Popen(
        [str(python_bin), "-m", "uvicorn", "main:app",
         "--host", "127.0.0.1", "--port", "8083"],
        cwd=OCR_DIR,
        env={**os.environ, "OCR_PORT": "8083", "OCR_LLAMA_PORT": "8082", "PYTHONUNBUFFERED": "1"},
        stdout=open(log_path, "ab"),
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    log(f"  pid={p.pid}")
    return p


def kill_ocr() -> None:
    """Kill Server OCR FastAPI + llama-server 子进程."""
    log("killing Server OCR processes ...")
    subprocess.run(["pkill", "-f", "main:app.*8083"], check=False)
    subprocess.run(["pkill", "-f", "llama-server.*8082"], check=False)
    log("done")


def log(msg: str) -> None:
    print(f"[server-run] {msg}", flush=True)


def run(cmd: list[str], cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    log(f"$ {' '.join(cmd)}")
    return subprocess.run(cmd, cwd=cwd, check=check)


def docker_up() -> None:
    if not COMPOSE_FILE.exists():
        log(f"compose file missing: {COMPOSE_FILE}")
        return
    log("starting PG + Redis (docker compose up -d) ...")
    run(["docker", "compose", "-f", str(COMPOSE_FILE), "up", "-d"], cwd=ROOT.parent)
    log("waiting for PG/Redis ready ...")
    for i in range(30):
        try:
            r = subprocess.run(
                ["docker", "compose", "-f", str(COMPOSE_FILE), "exec", "-T", "postgres",
                 "pg_isready", "-U", "javis"],
                cwd=ROOT.parent, capture_output=True, timeout=5,
            )
            if r.returncode == 0:
                log("PG ready")
                return
        except subprocess.TimeoutExpired:
            pass
        time.sleep(1)
    log("PG not ready in 30s, continuing (center will retry)")


def docker_down() -> None:
    if not COMPOSE_FILE.exists():
        return
    log("stopping docker compose ...")
    run(["docker", "compose", "-f", str(COMPOSE_FILE), "down"], cwd=ROOT.parent, check=False)


def cargo_build() -> None:
    """Build Rust center daemon (dev profile for fast iteration).

    --release 因 macOS Apple Silicon 链接器 bug (mis-aligned LINKEDIT string pool) 在 sqlx 上挂,
    改用 dev profile + 强 LTO 优化 (Cargo.toml profile.dev 已配 opt-level=3).
    """
    log("cargo build (dev) ...")
    log_path = LOG_DIR / "cargo-build.log"
    p = subprocess.Popen(
        ["cargo", "build"],
        cwd=CENTER_DIR,
        stdout=open(log_path, "wb"),
        stderr=subprocess.STDOUT,
    )
    rc = p.wait()
    if rc != 0:
        log(f"cargo build failed (rc={rc}), tail {log_path}:")
        subprocess.run(["tail", "-30", str(log_path)])
        sys.exit(1)
    log("cargo build OK")


def cargo_run() -> None:
    """Start center daemon in foreground. Ctrl-C to exit."""
    log("starting Rust center daemon (foreground, Ctrl-C to exit) ...")
    log("  port: 8080 (HTTP)")
    log("  log: tail -f $SERVER/.run-logs/center.log (when using --daemon)")
    log("")
    env = os.environ.copy()
    env.setdefault("RUST_LOG", "info,sqlx=warn")
    env.setdefault("DATABASE_URL", "postgres://javis:javis@localhost:5432/javis")
    # P2#2: 不再注入 REDIS_URL — 单实例部署不需要 Redis.
    env.setdefault("JWT_SECRET", env.get("JWT_SECRET", "dev-only-change-me-please-32-chars"))

    # 加载 .env.local (如果有) — 给 Rust center 注入 SMTP_* 配置 (P1#6 邮件降级)
    env_local = ROOT / ".env.local"
    if env_local.exists():
        for line in env_local.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            # P2#2: 移除 REDIS_URL — 单实例不再需要.
            if k == "REDIS_URL":
                log("  (ignoring REDIS_URL in .env.local: single-instance build)")
                continue
            if k.startswith(("SMTP_", "NOTIFY_SMTP_", "DATABASE_URL", "JWT_SECRET")):
                env.setdefault(k, v)
        log("loaded env overrides from .env.local")

    binary = CENTER_DIR / "target" / "debug" / "studio-arona-center"
    if not binary.exists():
        log("cargo build did not produce binary, building ...")
        cargo_build()

    try:
        subprocess.run([str(binary)], cwd=CENTER_DIR, env=env)
    except KeyboardInterrupt:
        log("\nreceived Ctrl-C, exiting")


def cargo_daemon() -> None:
    """Spawn center daemon in background. Returns after health check."""
    cargo_build()
    log("background mode: log -> .run-logs/center.log")
    log_path = LOG_DIR / "center.log"
    env = os.environ.copy()
    env.setdefault("RUST_LOG", "info,sqlx=warn")
    env.setdefault("DATABASE_URL", "postgres://javis:javis@localhost:5432/javis")
    # P2#2: 不再注入 REDIS_URL — 单实例部署不需要 Redis.
    env.setdefault("JWT_SECRET", env.get("JWT_SECRET", "dev-only-change-me-please-32-chars"))
    # 加载 .env.local 的 SMTP 配置 (P1#6)
    env_local = ROOT / ".env.local"
    if env_local.exists():
        for line in env_local.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            # P2#2: 移除 REDIS_URL — 单实例不再需要.
            if k == "REDIS_URL":
                continue
            if k.startswith(("SMTP_", "NOTIFY_SMTP_", "DATABASE_URL", "JWT_SECRET")):
                env.setdefault(k, v)
    binary = CENTER_DIR / "target" / "debug" / "studio-arona-center"
    f = open(log_path, "ab")
    p = subprocess.Popen(
        [str(binary)], cwd=CENTER_DIR, env=env,
        stdout=f, stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    log(f"center started (pid={p.pid}, log={log_path})")

    time.sleep(2)
    try:
        r = urllib.request.urlopen("http://127.0.0.1:8080/health", timeout=3)
        log(f"/health -> {r.status}")
    except Exception as e:
        log(f"/health failed: {e}")


def kill_center() -> None:
    """Kill center processes (narrow pkill)."""
    log("killing center processes ...")
    subprocess.run(["pkill", "-f", "target/debug/studio-arona-center"], check=False)
    log("done")


def tail_logs() -> None:
    log(f"tail -f {LOG_DIR}/*.log (Ctrl-C to exit)")
    logs = sorted(LOG_DIR.glob("*.log"))
    if not logs:
        log("no log files, run once first")
        return
    subprocess.run(["tail", "-f"] + [str(p) for p in logs])


def main() -> None:
    parser = argparse.ArgumentParser(description="StudioArona Server runner")
    parser.add_argument("--no-docker", action="store_true", help="don't start docker (PG/Redis assumed running)")
    parser.add_argument("--build", action="store_true", help="only build, don't run")
    parser.add_argument("--stop", action="store_true", help="stop docker + kill center + kill ocr")
    parser.add_argument("--logs", action="store_true", help="tail logs")
    parser.add_argument("--daemon", action="store_true", help="background mode (log -> .run-logs/center.log)")
    parser.add_argument("--ocr", action="store_true", help="also start Server OCR (port 8083, mutually exclusive with Client OCR)")
    parser.add_argument("--download-ocr", action="store_true", help="download OCR resources to Server/vendor/")
    args = parser.parse_args()

    if args.stop:
        kill_center()
        kill_ocr()
        if not args.no_docker:
            docker_down()
        return

    if args.logs:
        tail_logs()
        return

    if args.download_ocr:
        ensure_ocr_vendor()
        return

    if args.build:
        cargo_build()
        return

    if not args.no_docker:
        docker_up()

    # OCR
    if args.ocr:
        ensure_ocr_vendor()
        spawn_ocr()
        # 等 health
        for _ in range(30):
            try:
                r = urllib.request.urlopen("http://127.0.0.1:8083/health", timeout=2)
                if r.status == 200:
                    log(f"OCR healthy ({r.status})")
                    break
            except Exception:
                pass
            time.sleep(1)
        else:
            log("OCR not ready in 30s, check .run-logs/ocr.log")

    if args.daemon:
        cargo_daemon()
        return

    cargo_run()


if __name__ == "__main__":
    main()
