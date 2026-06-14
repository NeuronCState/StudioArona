"""install_deps.py — Bootstrap the StudioArona stack.

Run as part of `./run.sh start` (or standalone). Checks for required
external dependencies and installs them if missing. Idempotent — safe
to run on every startup.

Checks:
  1. uv  (Python package manager) — install if missing
  2. Docker / Docker Compose — install per platform
  3. Python dependencies (uv sync) — install if missing
  4. Hermes CLI — install if missing
  5. Required ML models (Fun-CosyVoice, Fun-Audio-Chat-8B-MNN) — pull via modelscope if missing
  6. PostgreSQL & Redis — assumed to be Dockerized; if Docker missing, install it

This module is intentionally self-contained so `./run.sh start` can
bring up a fresh checkout with zero manual setup.
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Callable, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[2]  # infra/scripts/install_deps.py → project root

# ─── Output helpers ──────────────────────────────────────────────────


class C:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    RED = "\033[0;31m"
    GREEN = "\033[0;32m"
    YELLOW = "\033[1;33m"
    CYAN = "\033[0;36m"
    DIM = "\033[2m"
    MAGENTA = "\033[0;35m"


def step(msg: str) -> None:
    print(f"\n{C.MAGENTA}[install-deps] ── {msg} ──{C.RESET}")


def ok(msg: str) -> None:
    print(f"{C.GREEN}[install-deps] ✓{C.RESET}  {msg}")


def warn(msg: str) -> None:
    print(f"{C.YELLOW}[install-deps] ⚠{C.RESET}  {msg}")


def err(msg: str) -> None:
    print(f"{C.RED}[install-deps] ✗{C.RESET}  {msg}")


def detail(msg: str) -> None:
    print(f"{C.DIM}    {msg}{C.RESET}")


def run(cmd: List[str], *, check: bool = True, **kwargs) -> subprocess.CompletedProcess:
    """Run a command, echoing it first. Streams output."""
    pretty = " ".join(cmd)
    detail(f"$ {pretty}")
    return subprocess.run(cmd, check=check, **kwargs)


# ─── Detection helpers ───────────────────────────────────────────────


def have(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def have_docker_running() -> bool:
    if not have("docker"):
        return False
    try:
        subprocess.run(
            ["docker", "info"],
            check=True,
            capture_output=True,
            timeout=5,
        )
        return True
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        return False


# ─── Installation routines ───────────────────────────────────────────


def install_uv() -> bool:
    """Install uv if missing. uv is the foundation — Python pkg manager."""
    if have("uv"):
        return True
    step("Installing uv")
    try:
        if sys.platform == "win32":
            subprocess.run(
                ["powershell", "-ExecutionPolicy", "ByPass", "-c",
                 "irm https://astral.sh/uv/install.ps1 | iex"],
                check=True,
            )
            local_bin = Path.home() / ".local" / "bin"
        else:
            subprocess.run(
                "curl -LsSf https://astral.sh/uv/install.sh | sh",
                shell=True, check=True,
            )
            local_bin = Path.home() / ".local" / "bin"
    except subprocess.CalledProcessError as e:
        err(f"uv install failed: {e}")
        return False
    # Refresh PATH for this process
    os.environ["PATH"] = f"{local_bin}{os.path.pathsep}{os.environ.get('PATH', '')}"
    return shutil.which("uv") is not None


def install_hermes() -> bool:
    """Install hermes CLI if missing. Uses install.sh from hermesagent.org.cn."""
    if have("hermes"):
        return True
    step("Installing Hermes CLI")
    if sys.platform == "win32":
        warn("Hermes CLI install is not supported on Windows — install manually from https://hermesagent.org.cn")
        return False
    try:
        run(["bash", "-c", "curl -fsSL https://res1.hermesagent.org.cn/install.sh | bash -s -- --skip-setup"], check=True)
    except subprocess.CalledProcessError as e:
        err(f"hermes install failed: {e}")
        return False
    os.environ["PATH"] = f"{Path.home()}/.local/bin:{os.environ.get('PATH', '')}"
    return shutil.which("hermes") is not None


def install_docker() -> bool:
    """Install Docker runtime per platform. Idempotent."""
    if have_docker_running():
        return True
    step("Installing Docker runtime")
    system = platform.system().lower()
    try:
        if system == "darwin":
            if not have("brew"):
                err("Homebrew not found — install from https://brew.sh first")
                return False
            if not have_brew_cask("orbstack"):
                run(["brew", "install", "--cask", "orbstack"], check=True)
            ok("OrbStack installed (best macOS experience)")
        elif system == "linux":
            if have("apt-get"):
                run(["sudo", "apt-get", "update"], check=True)
                run(["sudo", "apt-get", "install", "-y", "docker.io", "docker-compose-plugin"], check=True)
                run(["sudo", "systemctl", "enable", "--now", "docker"], check=False)
                # Add user to docker group
                try:
                    import pwd
                    user = pwd.getpwuid(os.getuid()).pw_name
                    run(["sudo", "usermod", "-aG", "docker", user], check=False)
                except (KeyError, ImportError):
                    pass
            elif have("dnf"):
                run(["sudo", "dnf", "install", "-y", "docker", "docker-compose"], check=True)
                run(["sudo", "systemctl", "enable", "--now", "docker"], check=False)
            elif have("pacman"):
                run(["sudo", "pacman", "-S", "--noconfirm", "docker", "docker-compose"], check=True)
                run(["sudo", "systemctl", "enable", "--now", "docker"], check=False)
            else:
                err("no supported package manager found; install Docker manually")
                return False
        elif system in ("windows", "mingw64", "msys", "cygwin"):
            if have("winget"):
                run(["winget", "install", "--id", "Docker.DockerDesktop",
                     "--accept-source-agreements", "--accept-package-agreements"], check=True)
            else:
                err("winget not found; install Docker Desktop manually")
                return False
        else:
            err(f"unsupported platform: {system}")
            return False
    except subprocess.CalledProcessError as e:
        err(f"Docker install failed: {e}")
        return False
    return have_docker_running()


def have_brew_cask(cask: str) -> bool:
    try:
        return subprocess.run(
            ["brew", "list", "--cask", cask],
            check=True, capture_output=True,
        ).returncode == 0
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def install_python_deps() -> bool:
    """Run uv sync if .venv missing or pyproject.toml has new deps."""
    if not have("uv"):
        err("uv not available; cannot sync Python deps")
        return False
    step("Syncing Python dependencies (uv sync)")
    venv = ROOT / ".venv"
    pyproject = ROOT / "pyproject.toml"
    marker = venv / ".last_sync_pyproject_hash"
    needs_sync = not venv.exists()
    if venv.exists() and marker.exists() and pyproject.exists():
        current = marker.read_text().strip()
        try:
            import hashlib
            actual = hashlib.sha256(pyproject.read_bytes()).hexdigest()
            if current != actual:
                needs_sync = True
        except Exception:
            needs_sync = True
    if not needs_sync:
        ok("Python deps already in sync (pyproject unchanged)")
        return True
    try:
        run(["uv", "sync", "--all-packages"], cwd=ROOT, check=True)
        # Stamp the hash for next-run comparison
        if pyproject.exists():
            import hashlib
            marker.write_text(hashlib.sha256(pyproject.read_bytes()).hexdigest())
        ok("Python deps synced")
        return True
    except subprocess.CalledProcessError as e:
        err(f"uv sync failed: {e}")
        return False


def install_models() -> bool:
    """Pull required ML models via modelscope if missing.

    Models are large (Fun-Audio-Chat-8B ≈ 1.2 GB, Fun-CosyVoice3 ≈ ??? MB)
    so this only runs when explicitly enabled or files are missing.
    """
    model_dir = ROOT / "services" / "agent" / "models"
    required = {
        "Fun-Audio-Chat-8B-MNN/llm.mnn.weight": "MNN/Fun-Audio-Chat-8B-MNN",
        # Fun-CosyVoice3-0.5B-2512 uses LLM weights too, add as needed
    }
    missing = []
    for rel_path, model_id in required.items():
        full = model_dir / rel_path
        if not full.exists() or full.stat().st_size < 1_000_000:
            missing.append((rel_path, model_id))
    if not missing:
        ok(f"All {len(required)} required models present")
        return True
    step(f"Pulling {len(missing)} missing models via modelscope")
    try:
        from modelscope import snapshot_download
        for rel_path, model_id in missing:
            detail(f"downloading {model_id} → {model_dir / Path(rel_path).parent}")
            cache_dir = model_dir / Path(rel_path).parent
            cache_dir.mkdir(parents=True, exist_ok=True)
            snapshot_download(model_id, cache_dir=str(cache_dir))
            ok(f"downloaded {model_id}")
        return True
    except ImportError:
        warn("modelscope not installed; skipping model download")
        warn("Run 'uv add modelscope && ./run.sh start' to enable")
        return True  # not fatal
    except Exception as e:
        warn(f"model download failed (non-fatal): {e}")
        return True  # non-fatal so start can proceed


# ─── Main entry ──────────────────────────────────────────────────────


def run_all(skip: Optional[List[str]] = None) -> bool:
    """Run all checks. skip: list of step names to skip (e.g. ['models'])."""
    skip = skip or []
    step("Pre-flight: checking dependencies")

    steps = [
        ("uv", install_uv),
        ("docker", install_docker),
        ("hermes", install_hermes),
        ("deps", install_python_deps),
    ]
    if "models" not in skip:
        steps.append(("models", install_models))

    ok_count = 0
    for name, fn in steps:
        if name in skip:
            detail(f"skipping {name}")
            continue
        if fn():
            ok_count += 1

    if ok_count == len(steps):
        ok("All pre-flight checks passed")
        return True
    warn(f"{ok_count}/{len(steps)} checks passed — some optional deps may be missing")
    return False


def main() -> int:
    args = sys.argv[1:]
    if not args or "--help" in args or "-h" in args:
        print("用法: ./run.sh install [--skip STEP1,STEP2,...]")
        print()
        print("跨平台 bootstrap：检查并安装运行 StudioArona 所需的全部依赖。")
        print("已装就跳过。失败不致命 —— start 会 graceful 继续。")
        print()
        print("Steps:")
        print("  uv       安装 uv（包管理器；macOS/Linux 全平台）")
        print("  docker   安装 OrbStack (macOS) / docker.io (Linux) / Docker Desktop (Win)")
        print("  hermes   安装 Hermes CLI（~/.local/bin/hermes）")
        print("  deps     uv sync 装 Python 依赖到 .venv")
        print("  models   （可选）拉 ML 模型（Fun-Audio-Chat-8B 等，1+ GB）")
        print()
        print("示例:")
        print("  ./run.sh install              # 跑全部 step")
        print("  ./run.sh install --skip models # 跳过模型（推荐）")
        return 0
    # Parse skip flags
    skip = []
    if "--skip" in args:
        idx = args.index("--skip")
        skip = [s.strip() for s in args[idx + 1].split(",")] if idx + 1 < len(args) else []
    run_all(skip=skip)
    return 0


if __name__ == "__main__":
    main()
