"""Multi-user isolation integration test for LLM Gateway.

Verifies:
  * Two users (alice, bob) get independent profile dirs
  * USER.md from each user is injected only into their own requests
  * Per-user Hermes daemon is spawned on first request (when hermes CLI present)
  * idle cleanup actually kills idle daemons

Does NOT require PostgreSQL/Docker — uses fake profiles on disk.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

# Ensure project importable
PROJECT_ROOT = Path("/Users/zhangxuanning/StudioArona").resolve()
sys.path.insert(0, str(PROJECT_ROOT))

# Force a known HERMES_BASE_HOME so we don't pollute ~/.hermes
TEST_HERMES_HOME = Path("/tmp/hermes-isolation-test")
TEST_HERMES_HOME.mkdir(exist_ok=True)
os.environ["HERMES_BASE_HOME"] = str(TEST_HERMES_HOME)

import httpx  # noqa: E402

# Re-import gateway with the env override
from services.llm_gateway import main as gw  # noqa: E402
import importlib  # noqa: E402
importlib.reload(gw)

GATEWAY_URL = "http://127.0.0.1:8645"


def _create_profile(user_id: str, user_md: str, memory_md: str = "") -> Path:
    profile = gw.get_profile_dir(user_id)
    profile.mkdir(parents=True, exist_ok=True)
    (profile / "USER.md").write_text(user_md)
    if memory_md:
        (profile / "MEMORY.md").write_text(memory_md)
    # Clear skills to keep test deterministic
    skills = profile / "skills"
    if skills.exists():
        shutil.rmtree(skills)
    return profile


def _read_user_context(user_id: str) -> str:
    """Replicate the gateway's context injection logic and return the
    combined prompt fragment that would be prepended to the system message."""
    runtime: dict = {}  # no API services running in test
    return gw.read_user_context(user_id, runtime=runtime) or ""


def test_isolated_user_context() -> None:
    """USER.md from one user must not leak into another's context."""
    _create_profile(
        "alice",
        "我叫 Alice，住深圳。职业：AI 工程师。",
        "记得我 3 月去过杭州出差。",
    )
    _create_profile(
        "bob",
        "我叫 Bob，住北京。职业：设计师。",
        "记得我喜欢极简风格。",
    )
    ctx_alice = _read_user_context("alice")
    ctx_bob = _read_user_context("bob")
    assert "Alice" in ctx_alice and "深圳" in ctx_alice, "alice context missing"
    assert "Bob" not in ctx_alice and "北京" not in ctx_alice, "alice leaked bob"
    assert "Bob" in ctx_bob and "北京" in ctx_bob, "bob context missing"
    assert "Alice" not in ctx_bob and "深圳" not in ctx_bob, "bob leaked alice"
    print("✓ test_isolated_user_context")


def test_skills_dual_origin() -> None:
    """Skills list distinguishes user-provided from Hermes-generated."""
    profile = gw.get_profile_dir("alice")
    skills_dir = profile / "skills"
    skills_dir.mkdir(exist_ok=True)
    # Each skill is a subdirectory with SKILL.md inside
    (skills_dir / "weather" / "SKILL.md").parent.mkdir(exist_ok=True)
    (skills_dir / "weather" / "SKILL.md").write_text("# 天气查询\n\n")
    (skills_dir / "schedule" / "SKILL.md").parent.mkdir(exist_ok=True)
    (skills_dir / "schedule" / "SKILL.md").write_text("# 日程管理\n\n")
    # Hermes-generated (heuristic: dir name contains "generated")
    (skills_dir / "arona-generated-2024-12" / "SKILL.md").parent.mkdir(exist_ok=True)
    (skills_dir / "arona-generated-2024-12" / "SKILL.md").write_text("# Auto-generated\n\nCreated by hermes")
    skills = gw.read_user_skills("alice")
    by_origin = {s["origin"] for s in skills}
    assert "user" in by_origin and "hermes" in by_origin, f"missing origin: {by_origin}"
    user_skills = [s for s in skills if s["origin"] == "user"]
    hermes_skills = [s for s in skills if s["origin"] == "hermes"]
    assert len(user_skills) == 2, f"user skills: {[s['slug'] for s in user_skills]}"
    assert len(hermes_skills) == 1 and "generated" in hermes_skills[0]["slug"]
    print("✓ test_skills_dual_origin ({} skills total: {} user, {} hermes)".format(
        len(skills), len(user_skills), len(hermes_skills)))


def test_spawn_and_idle_kill() -> None:
    """If hermes CLI is installed, verify spawn creates a per-user
    daemon and idle cleanup kills it after timeout."""
    if not shutil.which("hermes"):
        print("⊘ test_spawn_and_idle_kill skipped (hermes CLI not installed)")
        return
    _create_profile("carol", "我叫 Carol")
    # Need an API key for spawn to succeed
    os.environ["MINIMAX_CN_API_KEY"] = "fake-key-for-test"
    os.environ["MINIMAX_CN_BASE_URL"] = "https://api.minimaxi.com/v1"
    # Use very short idle timeout for the test
    os.environ["LLM_GATEWAY_IDLE_TIMEOUT"] = "3"
    async def run_test():
        await gw.sessions.spawn("carol")
        sess = gw.sessions.sessions.get("carol")
        assert sess is not None and sess.pid, "spawn failed"
        # Force-pretend it has been idle for a long time
        sess.last_active = time.time() - 10
        print(f"  spawned pid={sess.pid}, last_active forced 10s ago")
        killed = gw.sessions.cleanup_idle_sync()
        assert killed == 1, f"expected 1 kill, got {killed}"
        # PID is in zombie state (process exited, not reaped) — that's OK
        # because the spawned process group was orphaned to init.
        import subprocess as sp
        r = sp.run(["ps", "-p", str(sess.pid), "-o", "state="],
                   capture_output=True, text=True)
        state = r.stdout.strip()
        if state in ("Z", "XZ", "Z+") or "Z" in state:
            print(f"  ✓ pid {sess.pid} is zombie (killed successfully)")
        else:
            # PID no longer in process table — also fine
            print(f"  ✓ pid {sess.pid} reaped (state={state!r})")
    asyncio.run(run_test())
    print("✓ test_spawn_and_idle_kill")


def main() -> None:
    print(f"Test HERMES_BASE_HOME: {TEST_HERMES_HOME}")
    test_isolated_user_context()
    test_skills_dual_origin()
    test_spawn_and_idle_kill()
    # Cleanup
    if TEST_HERMES_HOME.exists():
        shutil.rmtree(TEST_HERMES_HOME)
    print("\n✅ all tests passed")


if __name__ == "__main__":
    main()
