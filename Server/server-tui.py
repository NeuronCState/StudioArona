#!/usr/bin/env python3
"""
Studio Arona Server — TUI 面板 (OpenCode 风格).

启动 Docker (PG/Redis) + Rust center daemon, 实时展示:
  - 服务状态 (Docker / Center / 端口)
  - 中文日志流
  - 健康检查
  - 一键停止

依赖: rich (Server/.venv-runner 已装)

用法:
  python3 server-tui.py              # 前台 TUI 模式
  python3 server-tui.py --no-docker  # 跳过 Docker
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CENTER_DIR = ROOT / "center"
COMPOSE_FILE = ROOT / "infra" / "compose" / "docker-compose.yml"
LOG_DIR = ROOT / ".run-logs"
LOG_DIR.mkdir(exist_ok=True)

try:
    from rich.live import Live
    from rich.panel import Panel
    from rich.table import Table
    from rich.layout import Layout
    from rich.console import Console, Group
    from rich.text import Text
    from rich.align import Align
    from rich import box
except ImportError:
    print("需要 rich 库: pip install rich")
    sys.exit(1)

console = Console()
center_proc = None
log_lines: list[str] = []
log_lock = threading.Lock()
MAX_LOG_LINES = 200

# ── 状态 ──
status = {
    "docker": "等待中",
    "center": "等待中",
    "health": "未检测",
    "port": "8080",
    "pid": "",
    "uptime": "",
}
start_time = time.time()


def docker_up() -> bool:
    if not COMPOSE_FILE.exists():
        status["docker"] = "compose 文件缺失"
        return False
    try:
        subprocess.run(
            ["docker", "compose", "-f", str(COMPOSE_FILE), "up", "-d"],
            capture_output=True, timeout=30,
        )
        for _ in range(30):
            r = subprocess.run(
                ["docker", "compose", "-f", str(COMPOSE_FILE), "exec", "-T", "postgres", "pg_isready", "-U", "javis"],
                capture_output=True, timeout=5,
            )
            if r.returncode == 0:
                status["docker"] = "运行中 (PG + Redis)"
                return True
            time.sleep(1)
        status["docker"] = "PG 未就绪 (30s)"
        return False
    except Exception as e:
        status["docker"] = f"启动失败: {e}"
        return False


def cargo_start() -> bool:
    global center_proc
    binary = CENTER_DIR / "target" / "debug" / "studio-arona-center"
    if not binary.exists():
        status["center"] = "编译中..."
        r = subprocess.run(["cargo", "build"], cwd=CENTER_DIR, capture_output=True, timeout=120)
        if r.returncode != 0:
            status["center"] = "编译失败"
            return False

    log_path = LOG_DIR / "center.log"
    f = open(log_path, "ab")
    env = os.environ.copy()
    env.setdefault("RUST_LOG", "info,sqlx=warn")
    env.setdefault("DATABASE_URL", "postgres://javis:javis@localhost:5432/javis")
    env.setdefault("JWT_SECRET", os.environ.get("JWT_SECRET", "dev-only-change-me-please-32-chars"))

    env_local = ROOT / ".env.local"
    if env_local.exists():
        for line in env_local.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env.setdefault(k.strip(), v.strip().strip('"').strip("'"))

    center_proc = subprocess.Popen(
        [str(binary)], cwd=CENTER_DIR, env=env,
        stdout=f, stderr=subprocess.STDOUT,
    )
    status["center"] = "运行中"
    status["pid"] = str(center_proc.pid)
    return True


def log_reader():
    """Tail center log into log_lines."""
    log_path = LOG_DIR / "center.log"
    if not log_path.exists():
        return
    with open(log_path, "r") as f:
        f.seek(0, 2)  # seek to end
        while center_proc and center_proc.poll() is None:
            line = f.readline()
            if line:
                with log_lock:
                    log_lines.append(line.rstrip())
                    if len(log_lines) > MAX_LOG_LINES:
                        log_lines.pop(0)


def health_check() -> None:
    import urllib.request
    try:
        r = urllib.request.urlopen("http://127.0.0.1:8080/health", timeout=2)
        status["health"] = f"正常 ({r.status})"
    except Exception as e:
        status["health"] = f"未响应 ({e})"


def build_layout() -> Layout:
    layout = Layout()
    layout.split_column(
        Layout(name="header", size=3),
        Layout(name="body"),
        Layout(name="footer", size=3),
    )
    layout["body"].split_row(
        Layout(name="left", ratio=2),
        Layout(name="right", ratio=3),
    )
    layout["left"].split_column(
        Layout(name="status"),
        Layout(name="info"),
    )
    return layout


def render_header() -> Panel:
    title = Text("什亭之匣 · Studio Arona Server", style="bold white on #b8552b")
    subtitle = Text(f"端口 :8080  |  运行时间 {int(time.time() - start_time)}s  |  Ctrl+C 停止", style="dim")
    return Panel(Group(title, Align.center(subtitle)), box=box.HEAVY)


def render_status() -> Panel:
    table = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
    table.add_column("服务", style="bold cyan", width=10)
    table.add_column("状态", style="white")

    docker_color = "green" if "运行" in status["docker"] else "yellow" if "中" in status["docker"] else "red"
    center_color = "green" if status["center"] == "运行中" else "yellow"
    health_color = "green" if "正常" in status["health"] else "red"

    table.add_row("Docker", f"[{docker_color}]{status['docker']}[/{docker_color}]")
    table.add_row("Center", f"[{center_color}]{status['center']}[/{center_color}]")
    table.add_row("健康检查", f"[{health_color}]{status['health']}[/{health_color}]")
    return Panel(table, title="服务状态", border_style="cyan")


def render_info() -> Panel:
    t = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
    t.add_column("项", style="dim", width=10)
    t.add_column("值", style="white")
    t.add_row("PID", status["pid"] or "-")
    t.add_row("端口", status["port"])
    t.add_row("日志", str(LOG_DIR / "center.log"))
    t.add_row("环境", "dev" if "debug" in str(CENTER_DIR / "target") else "release")
    return Panel(t, title="运行信息", border_style="cyan")


def render_logs() -> Panel:
    with log_lock:
        lines = list(log_lines[-40:])
    if not lines:
        lines = ["等待日志输出..."]
    text = "\n".join(lines[-40:])
    return Panel(
        Text(text, style="dim", overflow="fold"),
        title="实时日志",
        border_style="green",
        height=22,
    )


def render_help() -> Panel:
    return Panel(
        Text("Ctrl+C 停止服务  |  http://127.0.0.1:8080/health 健康检查  |  tail -f .run-logs/center.log 查看完整日志",
             style="dim"),
        box=box.SIMPLE,
    )


def main():
    parser = argparse.ArgumentParser(description="Studio Arona Server TUI")
    parser.add_argument("--no-docker", action="store_true", help="跳过 Docker")
    args = parser.parse_args()

    layout = build_layout()

    with Live(layout, console=console, refresh_per_second=4, screen=True) as live:
        # 1. Docker
        if not args.no_docker:
            docker_up()
            live.update(layout)

        # 2. Build + Start center
        cargo_start()
        live.update(layout)

        # 3. Start log reader
        log_thread = threading.Thread(target=log_reader, daemon=True)
        log_thread.start()

        # 4. Main loop
        try:
            while center_proc and center_proc.poll() is None:
                health_check()
                layout["header"].update(render_header())
                layout["status"].update(render_status())
                layout["info"].update(render_info())
                layout["right"].update(render_logs())
                layout["footer"].update(render_help())
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        finally:
            status["center"] = "已停止"
            if center_proc:
                center_proc.terminate()
                center_proc.wait(timeout=5)
            layout["header"].update(render_header())
            layout["status"].update(render_status())
            live.update(layout)
            time.sleep(0.5)

    console.print("\n[green]服务已停止。[/green]")


if __name__ == "__main__":
    main()
