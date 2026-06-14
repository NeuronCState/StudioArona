#!/usr/bin/env python3
"""StudioArona 跨平台业务启动器（替换原 infra/scripts/start.sh）

由 run.sh / run.bat 通过 vendor Python 跨平台调用。
行为与原 bash 脚本一致：环境检查 → 端口检测 → venv 自愈 → 启动 PG/Redis →
数据库迁移 → 启动后端服务 → 启动前端 → 等待清理。
"""

from __future__ import annotations

import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import List

# Make `infra` importable when running as a script: `python infra/scripts/start.py`
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# ─── 颜色 ──────────────────────────────────────────────────────────
RED = "\033[0;31m"
GREEN = "\033[0;32m"
YELLOW = "\033[1;33m"
CYAN = "\033[0;36m"
BLUE = "\033[0;34m"
MAGENTA = "\033[0;35m"
WHITE = "\033[1;37m"
DIM = "\033[2m"
NC = "\033[0m"

# 路径
ROOT = Path(__file__).resolve().parents[2]  # infra/scripts/start.py → 项目根
COMPOSE_FILE = ROOT / "infra/compose/docker-compose.yml"
PIDS: List[subprocess.Popen] = []
CLEANED_UP = False
_bridge_was_started = False  # set True when start.py launched the bridge (so the
                            # main loop knows whether to auto-respawn it on death)


# ─── 跨平台辅助 ────────────────────────────────────────────────────
def venv_bin(name: str = "python") -> Path:
    """Return the path to a venv binary, platform-aware (bin/ vs Scripts/)."""
    if sys.platform == "win32":
        return ROOT / ".venv" / "Scripts" / (name + ".exe")
    return ROOT / ".venv" / "bin" / name


def _tmp_dir() -> Path:
    """Return the system temp directory as a Path."""
    return Path(tempfile.gettempdir())


# ─── 日志函数 ──────────────────────────────────────────────────────


def _is_port_listening(port: int) -> bool:
    """Quick check: is anything listening on this port? Returns True if so."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.2)
    try:
        s.connect(("127.0.0.1", port))
        s.close()
        return True
    except (ConnectionRefusedError, socket.timeout, OSError):
        return False
    finally:
        try:
            s.close()
        except Exception:
            pass
def ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


def log(msg: str) -> None:
    print(f"{GREEN}[{ts()}]{NC} {msg}")


def warn(msg: str) -> None:
    print(f"{YELLOW}[{ts()}] ⚠{NC}  {msg}")


def err(msg: str) -> None:
    print(f"{RED}[{ts()}] ✗{NC}  {msg}", file=sys.stderr)


def info(msg: str) -> None:
    print(f"{CYAN}[{ts()}]{NC} {msg}")


def step(msg: str) -> None:
    print(f"\n{MAGENTA}[{ts()}] ── {msg} ──{NC}")


def ok(msg: str) -> None:
    print(f"{GREEN}[{ts()}] ✓{NC}  {msg}")


def detail(msg: str) -> None:
    print(f"{DIM}[{ts()}]    {msg}{NC}")


def highlight(msg: str) -> None:
    print(f"{WHITE}[{ts()}] →{NC}  {msg}")


# ─── 清理（信号/退出时） ───────────────────────────────────────────
def cleanup() -> None:
    global CLEANED_UP
    if CLEANED_UP:
        return
    CLEANED_UP = True

    print()
    step("正在关闭所有服务")

    for proc in PIDS:
        try:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        except Exception:
            pass

    detail("终止残留进程...")
    for pattern in [
        "uvicorn app.main",
        "uvicorn.*llm_gateway",
        "hermes gateway",          # 杀掉所有 per-user hermes 进程
        "node services/agent/bridge",
        "pnpm.*web dev",
        "vite",
    ]:
        try:
            if sys.platform == "win32":
                subprocess.run(
                    ["taskkill", "/F", "/IM", "node.exe"],
                    check=False, capture_output=True,
                )
            else:
                subprocess.run(["pkill", "-f", pattern], check=False, capture_output=True)
        except Exception:
            pass

    detail("停止 Docker 容器...")
    try:
        subprocess.run(
            ["docker", "compose", "-f", str(COMPOSE_FILE), "stop"],
            check=False,
            capture_output=True,
        )
    except Exception:
        pass

    ok("所有服务已关闭，再见！")
    sys.exit(0)


def _signal_handler(signum, frame):
    cleanup()


# ─── 工具函数 ──────────────────────────────────────────────────────
def check_command(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def check_port(port: int) -> bool:
    """端口空闲返回 True。"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("0.0.0.0", port))
            return True
        except OSError:
            return False


def kill_port(port: int) -> None:
    """跨平台终止占用端口的进程（lsof 在 Windows 不可用，回退 fuser）。"""
    if check_command("lsof"):
        subprocess.run(
            ["bash", "-c", f"kill -9 $(lsof -ti :{port}) 2>/dev/null"],
            check=False,
            capture_output=True,
        )
    elif sys.platform == "win32":
        # Windows: netstat + taskkill
        try:
            r = subprocess.run(
                ["netstat", "-ano", "-p", "TCP"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            for line in r.stdout.splitlines():
                if f":{port} " in line and "LISTENING" in line:
                    parts = line.split()
                    if parts:
                        pid = parts[-1]
                        subprocess.run(
                            ["taskkill", "/F", "/PID", pid],
                            check=False,
                            capture_output=True,
                        )
        except Exception:
            pass


# ─── 环境检查 ──────────────────────────────────────────────────────
def check_environment() -> None:
    step("环境检查")

    if not check_command("docker"):
        err("未找到 Docker，请先安装 Docker Desktop")
        sys.exit(1)
    ok("Docker 已安装")

    # 等待 Docker daemon 就绪（最多 30 秒）
    for i in range(1, 31):
        r = subprocess.run(["docker", "info"], capture_output=True)
        if r.returncode == 0:
            ok("Docker 守护进程运行中")
            break
        if i == 1:
            detail("Docker daemon 未就绪，尝试自动启动 Docker Desktop...")
            subprocess.run(["open", "-a", "Docker Desktop"], check=False)
        print(f"{DIM}[{ts()}]    等待 Docker daemon... ({i}/30){NC}", end="\r")
        time.sleep(1)
    else:
        err("Docker daemon 启动超时（30秒），请手动启动 Docker Desktop 后重试")
        sys.exit(1)

    if not check_command("uv"):
        err("未找到 uv，请先安装：curl -LsSf https://astral.sh/uv/install.sh | sh")
        sys.exit(1)
    r = subprocess.run(["uv", "--version"], capture_output=True, text=True)
    ok(f"uv 已安装 ({r.stdout.strip()})")

    if not check_command("pnpm"):
        warn("未找到 pnpm，前端跳过 — 跑 `npm install -g pnpm` 后重试")
    else:
        r = subprocess.run(["pnpm", "--version"], capture_output=True, text=True)
        ok(f"pnpm 已安装 ({r.stdout.strip()})")

    if check_command("node"):
        r = subprocess.run(["node", "--version"], capture_output=True, text=True)
        ok(f"Node.js 已安装 ({r.stdout.strip()})")
    else:
        warn("未找到 Node.js，agent bridge 将无法启动")

    # Hermes Agent is the recommended runtime for the agent side of the stack.
    if check_command("hermes"):
        r = subprocess.run(["hermes", "--version"], capture_output=True, text=True)
        ok(f"Hermes Agent 已安装 ({r.stdout.strip()})")
    else:
        warn("未找到 hermes CLI（按需安装，参考 docs/hermes-integration.md）")


# ─── 环境变量 ──────────────────────────────────────────────────────
def load_env() -> None:
    env_file = ROOT / ".env.local"
    if not env_file.exists():
        warn(".env.local 不存在，从 .env.example 复制")
        shutil.copy(ROOT / ".env.example", env_file)

    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

    detail("已加载 .env.local")
    detail(f"运行环境: {os.environ.get('APP_ENV', 'development')}")
    db_url = os.environ.get("DATABASE_URL", "")
    detail(f"数据库: {db_url.split('@')[0] if '@' in db_url else db_url}")
    detail(f"Bridge 端口: {os.environ.get('BRIDGE_PORT', '18790')}")
    api_key = os.environ.get("MINIMAX_API_KEY", "")
    if len(api_key) >= 12:
        detail(f"MiniMax API Key: {api_key[:8]}...{api_key[-4:]}")


# ─── 端口检测 ──────────────────────────────────────────────────────
def check_ports() -> None:
    step("端口冲突检测")

    bridge_port = int(os.environ.get("BRIDGE_PORT", "18790"))
    ports_to_check = [
        (5432, "PostgreSQL"),
        (6379, "Redis"),
        (8080, "API Gateway"),
        (8645, "LLM Gateway (OpenAI-compat)"),
        (bridge_port, "Agent Bridge"),
        (8002, "Perception"),
        (5173, "前端 (Vite)"),
    ]

    conflicts = []
    for port, name in ports_to_check:
        if not check_port(port):
            warn(f"端口 {port} ({name}) 已被占用")
            conflicts.append(port)
        else:
            detail(f"端口 {port} ({name}) 空闲")

    if not conflicts:
        ok("所有端口空闲")
        return

    warn(f"有 {len(conflicts)} 个端口被占用: {' '.join(map(str, conflicts))}")
    if not sys.stdin.isatty():
        answer = "Y"
        detail("非交互模式，自动终止冲突进程")
    else:
        print(f"{YELLOW}输入 Y 确认终止，其他键退出：{NC} ", end="")
        answer = input()
    if answer.upper() != "Y":
        err("用户取消启动")
        sys.exit(1)
    for port in conflicts:
        detail(f"终止占用端口 {port} 的进程...")
        kill_port(port)
    time.sleep(2)
    ok("冲突进程已清理")


# ─── venv 自愈 ─────────────────────────────────────────────────────
def venv_self_heal() -> None:
    step("Python 虚拟环境检查")

    py = venv_bin("python")
    needs_rebuild = False

    if not py.exists():
        warn(f"{py.name} 不存在")
        needs_rebuild = True
    else:
        try:
            subprocess.run(
                [str(py), "-c", "import sys"],
                check=True,
                capture_output=True,
                timeout=10,
            )
        except Exception:
            warn(f"{py} 无法运行（可能是项目目录改名后残留的旧路径）")
            needs_rebuild = True

    uvicorn_bin = venv_bin("uvicorn")
    if uvicorn_bin.exists():
        try:
            subprocess.run(
                [str(uvicorn_bin), "--version"],
                check=True,
                capture_output=True,
                timeout=10,
            )
        except Exception:
            warn("uvicorn 无法运行，需要重建虚拟环境")
            needs_rebuild = True

    if needs_rebuild:
        detail("正在重建虚拟环境...")
        shutil.rmtree(ROOT / ".venv")
        subprocess.run(["uv", "sync"], cwd=ROOT, check=True)
        ok("虚拟环境已重建")
    else:
        ok(f"虚拟环境正常 ({py.name} 可用)")


# ─── PG + Redis ────────────────────────────────────────────────────
def start_pg_redis() -> None:
    step("1/4 启动 PostgreSQL + Redis")

    detail("正在拉起 Docker 容器...")
    r = subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE_FILE), "up", "-d", "postgres", "redis"],
        check=False,
    )
    if r.returncode != 0:
        err("docker compose up 失败 — 请确认 Docker Desktop 正在运行")
        sys.exit(1)

    detail("等待 PostgreSQL 就绪...")
    for i in range(1, 31):
        r = subprocess.run(
            ["docker", "compose", "-f", str(COMPOSE_FILE), "exec", "postgres",
             "pg_isready", "-U", "javis"],
            capture_output=True,
        )
        if r.returncode == 0:
            ok("PostgreSQL 已就绪 (端口 5432, 用户 javis)")
            break
        print(f"{DIM}[{ts()}]    等待 PostgreSQL... ({i}/30){NC}", end="\r")
        time.sleep(1)
    else:
        err("PostgreSQL 启动超时（30秒）")
        sys.exit(1)

    detail("等待 Redis 就绪...")
    for i in range(1, 16):
        r = subprocess.run(
            ["docker", "compose", "-f", str(COMPOSE_FILE), "exec", "redis",
             "redis-cli", "ping"],
            capture_output=True,
        )
        if r.returncode == 0:
            ok("Redis 已就绪 (端口 6379)")
            break
        print(f"{DIM}[{ts()}]    等待 Redis... ({i}/15){NC}", end="\r")
        time.sleep(1)
    else:
        err("Redis 启动超时（15秒）")
        sys.exit(1)


# ─── alembic 迁移 ──────────────────────────────────────────────────
def alembic_upgrade() -> None:
    step("2/4 数据库迁移")

    py = venv_bin("python")
    r = subprocess.run([str(py), "-c", "import sqlalchemy"], capture_output=True)
    if r.returncode != 0:
        err("venv 损坏：无法导入 sqlalchemy，请先运行 uv sync")
        err("常见原因：Python 版本升级导致 .venv 中的 C 扩展不兼容")
        sys.exit(1)
    detail("sqlalchemy 导入检查通过")

    log_file = _tmp_dir() / f"alembic-{os.getpid()}.log"
    detail(f"正在执行 alembic upgrade head (日志: {log_file})...")
    with open(log_file, "w") as f:
        r = subprocess.run(
            [str(venv_bin("alembic")), "-c", "alembic.ini", "upgrade", "head"],
            cwd=ROOT,
            stdout=f,
            stderr=subprocess.STDOUT,
        )
    if r.returncode != 0:
        err(f"alembic 迁移失败（可能 PG 未就绪），日志: {log_file}")
        sys.exit(1)
    try:
        log_file.unlink()
    except Exception:
        pass
    ok("数据库迁移完成")


# ─── 后端服务 ──────────────────────────────────────────────────────
def start_backends() -> None:
    step("3/4 启动后端服务")

    py = venv_bin("python")

    # API Gateway
    detail("正在启动 API Gateway...")
    p = subprocess.Popen(
        [str(py), "-m", "uvicorn", "app.main:app",
         "--app-dir", "services/api-gateway",
         "--host", "0.0.0.0", "--port", "8080",
         "--reload", "--reload-dir", "services/api-gateway/app"],
        cwd=ROOT,
    )
    PIDS.append(p)
    ok(f"API Gateway 已启动 (PID {p.pid}, 端口 8080)")
    detail("  → 文档: http://localhost:8080/docs")

    # LLM Gateway (OpenAI-compatible HTTP front for MiniMax / Hermes config)
    # Frontend .env points at LLM Gateway via api-gateway proxy.
    # In development, --reload is enabled so editing main.py picks up changes
    # without restart.
    llm_gw_port = int(os.environ.get("LLM_GATEWAY_PORT", "8645"))
    detail("正在启动 LLM Gateway (OpenAI 兼容代理)...")
    p = subprocess.Popen(
        [str(py), "-m", "uvicorn", "main:app",
         "--app-dir", "services/llm_gateway",
         "--host", "127.0.0.1", "--port", str(llm_gw_port),
         "--reload", "--reload-dir", "services/llm_gateway"],
        cwd=ROOT,
    )
    PIDS.append(p)
    ok(f"LLM Gateway 已启动 (PID {p.pid}, 端口 {llm_gw_port})")
    detail(f"  → 健康检查: http://localhost:{llm_gw_port}/health")
    detail(f"  → OpenAI 兼容端点: http://localhost:{llm_gw_port}/v1/chat/completions")

    # Agent Bridge
    bridge_js = ROOT / "services/agent/bridge/server.js"
    bridge_port = os.environ.get("BRIDGE_PORT", "18790")
    if bridge_js.exists():
        if check_command("node"):
            detail("正在启动 Agent Bridge...")
            p = subprocess.Popen(
                ["node", "services/agent/bridge/server.js"],
                cwd=ROOT,
            )
            PIDS.append(p)
            _bridge_was_started = True
            ok(f"Agent Bridge 已启动 (PID {p.pid}, 端口 {bridge_port})")
            detail(f"  → 健康检查: http://localhost:{bridge_port}/health")
        else:
            warn("node 未安装，跳过 Agent Bridge")
    else:
        warn("services/agent/bridge/server.js 不存在，跳过 Agent Bridge")

    # Perception
    detail("正在启动 Perception 服务...")
    p = subprocess.Popen(
        [str(py), "-m", "uvicorn", "app.main:app",
         "--app-dir", "services/perception",
         "--host", "0.0.0.0", "--port", "8002",
         "--reload", "--reload-dir", "services/perception/app"],
        cwd=ROOT,
    )
    PIDS.append(p)
    ok(f"Perception 服务已启动 (PID {p.pid}, 端口 8002)")

    # Weather fetcher daemon — long-lived prefetch of weather for known cities
    # (per-user USER.md "city:" + defaults). Writes ~/.studioarona/weather_cache.json
    # every 5 min. The web weather endpoint reads this file synchronously.
    weather_script = ROOT / "services/llm_gateway/weather_fetcher.py"
    if weather_script.exists():
        detail("正在启动 Weather Fetcher daemon...")
        weather_log_path = _tmp_dir() / "weather-fetcher.log"
        weather_log = open(weather_log_path, "a")
        p = subprocess.Popen(
            [str(py), str(weather_script)],
            cwd=ROOT,
            stdout=weather_log,
            stderr=weather_log,
        )
        PIDS.append(p)
        ok(f"Weather Fetcher 已启动 (PID {p.pid}, 每 300s 抓一次, 日志: {weather_log_path})")
    else:
        warn("services/llm_gateway/weather_fetcher.py 不存在，跳过")

    # RSS Fetcher — polls all enabled feeds from PG every 15 min, stores new items
    rss_fetcher_js = ROOT / "services/agent/bridge/rss-fetcher.js"
    if rss_fetcher_js.exists():
        if check_command("node"):
            detail("正在启动 RSS Fetcher...")
            rss_log_path = _tmp_dir() / "rss-fetcher.log"
            rss_log = open(rss_log_path, "a")
            p = subprocess.Popen(
                ["node", "services/agent/bridge/rss-fetcher.js"],
                cwd=ROOT,
                stdout=rss_log,
                stderr=rss_log,
            )
            PIDS.append(p)
            ok(f"RSS Fetcher 已启动 (PID {p.pid}, 每 15min 轮询, 日志: {rss_log_path})")
            detail(f"  → 健康检查: http://localhost:8003/health")
        else:
            warn("node 未安装，跳过 RSS Fetcher")
    else:
        warn("services/agent/bridge/rss-fetcher.js 不存在，跳过")

    # Web Watcher — intelligent monitor for plain websites (no RSS).
    # Pipeline: detect change → cheerio extract links → Readability → MiniMax summarize
    # → feed_item. Self-sniffs: if URL is actually a feed, rss-fetcher handles it instead.
    web_watcher_js = ROOT / "services/agent/bridge/web-watcher.js"
    if web_watcher_js.exists():
        if check_command("node"):
            detail("正在启动 Web Watcher...")
            ww_log_path = _tmp_dir() / "web-watcher.log"
            ww_log = open(ww_log_path, "a")
            p = subprocess.Popen(
                ["node", "services/agent/bridge/web-watcher.js"],
                cwd=ROOT,
                stdout=ww_log,
                stderr=ww_log,
            )
            PIDS.append(p)
            ok(f"Web Watcher 已启动 (PID {p.pid}, 智能监控普通网站, 日志: {ww_log_path})")
        else:
            warn("node 未安装，跳过 Web Watcher")
    else:
        warn("services/agent/bridge/web-watcher.js 不存在，跳过")

    time.sleep(2)


# ─── 前端 ──────────────────────────────────────────────────────────
def start_frontend() -> None:
    step("4/4 启动前端")

    if not check_command("pnpm"):
        warn("pnpm 未安装，跳过前端")
        return

    detail("正在启动 Vite 开发服务器...")
    p = subprocess.Popen(["pnpm", "--filter", "web", "dev"], cwd=ROOT)
    PIDS.append(p)
    ok(f"前端已启动 (PID {p.pid}, 端口 5173)")
    time.sleep(2)


# ─── 启动横幅 ──────────────────────────────────────────────────────
def banner() -> None:
    print()
    print(f"{CYAN}╔══════════════════════════════════════════╗{NC}")
    print(f"{CYAN}║{NC}  {WHITE}Studio Arona — 前后端启动{NC}              {CYAN}║{NC}")
    print(f"{CYAN}║{NC}  {DIM}什亭之匣 AI · 工作室智能公告板{NC}         {CYAN}║{NC}")
    print(f"{CYAN}╚══════════════════════════════════════════╝{NC}")
    print()
    detail(f"当前用户: {os.environ.get('USER', os.environ.get('USERNAME', '?'))}")
    detail(f"工作目录: {ROOT}")
    detail(f"系统平台: {sys.platform}")
    detail(f"启动时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()


# ─── 主入口 ────────────────────────────────────────────────────────
def main() -> None:
    # 信号注册放到 main 里——这样 import 这个模块没有副作用，
    # 测试可以直接 from start import check_port / load_env 等函数。
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    os.chdir(ROOT)

    banner()

    # ─── Pre-flight: install missing deps (docker, uv, hermes, models) ───
    # Idempotent. Skipped when env var STUDIO_SKIP_INSTALL_DEPS=1 is set
    # (useful for CI or when you know everything is already installed).
    if os.environ.get("STUDIO_SKIP_INSTALL_DEPS") != "1":
        try:
            from infra.scripts.install_deps import run_all
            run_all(skip=os.environ.get("STUDIO_SKIP_INSTALL", "").split(","))
        except Exception as e:
            warn(f"install_deps 跳过 ({e}); 继续启动")

    check_environment()
    load_env()
    check_ports()
    venv_self_heal()

    # Vite 缓存清理
    vite_cache = ROOT / "apps/web/node_modules/.vite"
    if vite_cache.exists():
        shutil.rmtree(vite_cache)
        detail("已清理 Vite 依赖缓存")

    start_pg_redis()
    alembic_upgrade()
    start_backends()
    start_frontend()

    # 启动完成
    print()
    print(f"{GREEN}╔══════════════════════════════════════════╗{NC}")
    print(f"{GREEN}║{NC}  {WHITE}✓ 所有服务已启动{NC}                        {GREEN}║{NC}")
    print(f"{GREEN}╚══════════════════════════════════════════╝{NC}")
    print()
    print(f"  {CYAN}前端页面{NC}      http://localhost:5173")
    print(f"  {CYAN}API 网关{NC}      http://localhost:8080")
    print(f"  {CYAN}API 文档{NC}      http://localhost:8080/docs")
    print(f"  {CYAN}LLM Gateway{NC}  http://localhost:8645  (OpenAI 兼容)")
    bridge_port = os.environ.get("BRIDGE_PORT", "18790")
    print(f"  {CYAN}Agent Bridge{NC} http://localhost:{bridge_port}")
    print(f"  {CYAN}Perception{NC}   http://localhost:8002")
    print()
    print(f"  {DIM}按 Ctrl+C 关闭所有服务{NC}")
    print()
    warn("如果前端页面白屏 / 一直在加载，先排查浏览器侧缓存：")
    detail("1. 打开 DevTools → Application → Service Workers → Unregister")
    detail("2. Application → Storage → Clear site data")
    detail("3. 强制刷新（Cmd+Shift+R）")
    print()

    # 等待（被信号打断时由 cleanup 处理）
    bridge_spawn_attempt = 0
    try:
        while True:
            time.sleep(1)
            # 检查子进程是否还在跑
            for proc in PIDS[:]:
                if proc.poll() is not None:
                    PIDS.remove(proc)
            # Bridge 监控：如果 :18790 没人监听，且之前启动过 bridge（说明 start.py 管过它），重启
            # 避免手动 attach 的孤儿 bridge 被 start.py 误以为服务在跑
            if not PIDS:
                warn("所有子进程已退出，自动关闭")
                cleanup()
            # Lazy-restart bridge if it died
            bridge_port = int(os.environ.get("BRIDGE_PORT", "18790"))
            if not _is_port_listening(bridge_port) and _bridge_was_started:
                bridge_spawn_attempt += 1
                if bridge_spawn_attempt >= 3:  # 3s 连续检测不到就拉起
                    detail("检测到 bridge 已退出，自动拉起")
                    p = subprocess.Popen(
                        ["node", "services/agent/bridge/server.js"],
                        cwd=ROOT,
                    )
                    PIDS.append(p)
                    bridge_spawn_attempt = 0
    except KeyboardInterrupt:
        cleanup()


if __name__ == "__main__":
    main()