#!/usr/bin/env python3
"""StudioArona Server — 启动脚本.

启动 PG/Redis (docker compose) + Rust center daemon (cargo run).

用法:
    python3 run.py                # 全套: docker up + cargo run
    python3 run.py --no-docker    # 不启 docker (假设 PG/Redis 已起)
    python3 run.py --build        # 只 build, 不 run
    python3 run.py --stop         # 停 docker + kill center
    python3 run.py --logs         # tail center 日志
    python3 run.py --daemon       # background 模式 (log -> .run-logs/center.log)

依赖:
    - docker (启 PG/Redis)
    - rust/cargo (启 center)
    - python3.12 (脚本本身, 跟 Client 统一版本)
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CENTER_DIR = ROOT / "center"
COMPOSE_FILE = ROOT / "infra" / "compose" / "docker-compose.yml"
LOG_DIR = ROOT / ".run-logs"
LOG_DIR.mkdir(exist_ok=True)


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
    log("cargo build (release) ...")
    log_path = LOG_DIR / "cargo-build.log"
    p = subprocess.Popen(
        ["cargo", "build", "--release"],
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
    env.setdefault("REDIS_URL", "redis://localhost:6379")
    env.setdefault("JWT_SECRET", env.get("JWT_SECRET", "dev-only-change-me-please-32-chars"))

    binary = CENTER_DIR / "target" / "release" / "center"
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
    env.setdefault("REDIS_URL", "redis://localhost:6379")
    env.setdefault("JWT_SECRET", env.get("JWT_SECRET", "dev-only-change-me-please-32-chars"))
    binary = CENTER_DIR / "target" / "release" / "center"
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
    subprocess.run(["pkill", "-f", "target/release/center"], check=False)
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
    parser.add_argument("--stop", action="store_true", help="stop docker + kill center")
    parser.add_argument("--logs", action="store_true", help="tail logs")
    parser.add_argument("--daemon", action="store_true", help="background mode (log -> .run-logs/center.log)")
    args = parser.parse_args()

    if args.stop:
        kill_center()
        if not args.no_docker:
            docker_down()
        return

    if args.logs:
        tail_logs()
        return

    if not args.no_docker:
        docker_up()

    if args.build:
        cargo_build()
        return

    if args.daemon:
        cargo_daemon()
        return

    cargo_run()


if __name__ == "__main__":
    main()