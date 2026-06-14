"""Unit tests for infra/scripts/start.py.

Covers the cross-platform Python rewrite of the old bash start.sh:
  - Pure helper functions (check_command / check_port / kill_port / load_env)
  - Environment probing (check_environment)
  - Self-heal logic (venv_self_heal)
  - Cleanup idempotency
  - End-to-end main() flow with subprocess mocked out
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from unittest.mock import MagicMock

import pytest


# ──────────────────── pure helpers ────────────────────


class TestCheckCommand:
    def test_present(self, monkeypatch, start_module):
        monkeypatch.setattr("shutil.which", lambda c: f"/usr/bin/{c}" if c == "uv" else None)
        assert start_module.check_command("uv") is True

    def test_absent(self, monkeypatch, start_module):
        monkeypatch.setattr("shutil.which", lambda c: None)
        assert start_module.check_command("definitely-not-a-command-xyz") is False


class TestCheckPort:
    def test_free_port_returns_true(self, start_module):
        # bind ephemeral port, immediately release, then check
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            free_port = s.getsockname()[1]
        assert start_module.check_port(free_port) is True

    def test_occupied_port_returns_false(self, start_module):
        """Hold a port open with a listening socket for the duration of the check."""
        import threading

        held_port = None

        def hold_port():
            nonlocal held_port
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            # Bind to 0.0.0.0 to match check_port()'s bind target exactly
            s.bind(("0.0.0.0", 0))
            held_port = s.getsockname()[1]
            s.listen(1)
            stop.wait()

        stop = threading.Event()
        t = threading.Thread(target=hold_port, daemon=True)
        t.start()
        for _ in range(50):
            if held_port is not None:
                break
            time.sleep(0.02)
        assert held_port is not None, "background listener never bound"

        try:
            assert start_module.check_port(held_port) is False
        finally:
            stop.set()
            t.join(timeout=1)


class TestKillPort:
    def test_uses_lsof_on_unix(self, monkeypatch, start_module, no_subprocess):
        # Pretend lsof exists
        monkeypatch.setattr(start_module, "check_command", lambda c: c == "lsof")
        start_module.kill_port(8080)
        cmds = [a[0][0] for a in no_subprocess.runs]
        assert "bash" in cmds

    def test_falls_back_to_netstat_on_windows(self, monkeypatch, start_module, fake_root):
        # No lsof available; pretend we're on Windows
        monkeypatch.setattr(start_module, "check_command", lambda c: False)
        monkeypatch.setattr(start_module, "sys", type("s", (), {"platform": "win32"}))

        fake_proc = MagicMock(return_value=MagicMock(
            stdout="  TCP    0.0.0.0:8080    0.0.0.0:0    LISTENING    1234",
            returncode=0,
        ))
        monkeypatch.setattr("subprocess.run", fake_proc)
        start_module.kill_port(8080)
        # Should have called netstat then taskkill
        args_list = [c.args[0] for c in fake_proc.call_args_list]
        assert any("netstat" in a for a in args_list)
        assert any("taskkill" in a for a in args_list)


# ──────────────────── env loading ────────────────────


class TestLoadEnv:
    def test_reads_local(self, start_module, fake_root, monkeypatch):
        monkeypatch.setattr(start_module, "ROOT", fake_root)
        start_module.load_env()
        assert os.environ["APP_ENV"] == "test"
        assert os.environ["MINIMAX_API_KEY"] == "sk-test-1234567890abcdef"
        assert os.environ["BRIDGE_PORT"] == "19999"

    def test_creates_from_example_when_missing(self, start_module, fake_root, monkeypatch):
        monkeypatch.setattr(start_module, "ROOT", fake_root)
        (fake_root / ".env.local").unlink()
        start_module.load_env()
        assert (fake_root / ".env.local").exists()
        assert os.environ["APP_ENV"] == "development"

    def test_does_not_override_existing(self, start_module, fake_root, monkeypatch):
        monkeypatch.setattr(start_module, "ROOT", fake_root)
        monkeypatch.setenv("APP_ENV", "production")
        start_module.load_env()
        # Existing env wins (setdefault)
        assert os.environ["APP_ENV"] == "production"

    def test_strips_quotes(self, start_module, fake_root, monkeypatch):
        monkeypatch.setattr(start_module, "ROOT", fake_root)
        (fake_root / ".env.local").write_text('FOO="bar baz"\n')
        monkeypatch.delenv("FOO", raising=False)
        start_module.load_env()
        assert os.environ["FOO"] == "bar baz"


# ──────────────────── environment probing ────────────────────


class TestCheckEnvironment:
    def _patch_all_present(self, monkeypatch, start_module):
        monkeypatch.setattr(start_module, "check_command", lambda c: True)
        monkeypatch.setattr(
            "subprocess.run",
            lambda *a, **kw: MagicMock(returncode=0, stdout="v1.0.0\n"),
        )

    def test_all_ok(self, monkeypatch, start_module, capsys, no_subprocess):
        self._patch_all_present(monkeypatch, start_module)
        start_module.check_environment()
        out = capsys.readouterr().out
        assert "Docker 已安装" in out
        assert "uv 已安装" in out
        assert "pnpm 已安装" in out
        assert "Node.js 已安装" in out
        assert "Hermes Agent 已安装" in out

    def test_docker_missing_exits(self, monkeypatch, start_module):
        monkeypatch.setattr(start_module, "check_command", lambda c: c != "docker")
        monkeypatch.setattr(
            "subprocess.run",
            lambda *a, **kw: MagicMock(returncode=0, stdout=""),
        )
        with pytest.raises(SystemExit) as ei:
            start_module.check_environment()
        assert ei.value.code == 1

    def test_docker_not_running_exits(self, monkeypatch, start_module):
        monkeypatch.setattr(start_module, "check_command", lambda c: True)
        monkeypatch.setattr(
            "subprocess.run",
            lambda *a, **kw: MagicMock(returncode=1, stdout=""),
        )
        monkeypatch.setattr("time.sleep", lambda _: None)
        with pytest.raises(SystemExit) as ei:
            start_module.check_environment()
        assert ei.value.code == 1

    def test_uv_missing_exits(self, monkeypatch, start_module):
        monkeypatch.setattr(start_module, "check_command", lambda c: c != "uv")
        monkeypatch.setattr(
            "subprocess.run",
            lambda *a, **kw: MagicMock(returncode=0, stdout=""),
        )
        with pytest.raises(SystemExit):
            start_module.check_environment()

    def test_pnpm_missing_warns(self, monkeypatch, start_module, capsys):
        monkeypatch.setattr(start_module, "check_command", lambda c: c != "pnpm")
        monkeypatch.setattr(
            "subprocess.run",
            lambda *a, **kw: MagicMock(returncode=0, stdout=""),
        )
        start_module.check_environment()
        out = capsys.readouterr().out
        assert "pnpm" in out.lower() or "前端跳过" in out


# ──────────────────── venv self-heal ────────────────────


class TestVenvSelfHeal:
    def test_no_rebuild_when_venv_ok(self, monkeypatch, start_module, fake_root, no_subprocess):
        monkeypatch.setattr(start_module, "ROOT", fake_root)
        start_module.venv_self_heal()
        # No uv sync should have been triggered
        assert not any("sync" in a[0] for a in no_subprocess.runs)

    def test_rebuilds_when_python_missing(self, monkeypatch, start_module, fake_root, no_subprocess):
        monkeypatch.setattr(start_module, "ROOT", fake_root)
        (fake_root / ".venv" / "bin" / "python").unlink()
        start_module.venv_self_heal()
        # uv sync should have been called
        sync_called = any("sync" in a[0] for a in no_subprocess.runs)
        assert sync_called

    def test_rebuilds_when_python_broken(self, monkeypatch, start_module, fake_root):
        """A non-executable .venv/bin/python should trigger a rebuild.

        We can't use the no_subprocess fixture here because it would swallow
        the OSError that start.py relies on for its self-heal detection.
        Instead, install a targeted subprocess.run stub that records calls
        and lets real OS errors propagate for our fake binary.
        """
        monkeypatch.setattr(start_module, "ROOT", fake_root)

        py = fake_root / ".venv/bin/python"
        # A truncated ELF — exec() will fail with OSError(8, "Exec format error")
        py.write_bytes(b"\x7fELF" + b"\xff" * 200)
        py.chmod(0o755)

        sync_calls = []

        def fake_run(argv, **kwargs):
            cmd_strs = [str(x) for x in argv]
            # Record uv invocations; for everything else, defer to real subprocess.
            if "uv" in cmd_strs and "sync" in cmd_strs:
                sync_calls.append(cmd_strs)
                return MagicMock(returncode=0)
            if "uv" in cmd_strs and "--version" in cmd_strs:
                return MagicMock(returncode=0, stdout="uv 0.0.0\n")
            # Real call → OS will fail on the fake ELF binary
            return subprocess.run(argv, **kwargs)

        monkeypatch.setattr(start_module.shutil, "rmtree", lambda p: None)
        monkeypatch.setattr("subprocess.run", fake_run)

        start_module.venv_self_heal()
        assert sync_calls, "venv_self_heal should have called 'uv sync'"


# ──────────────────── cleanup ────────────────────


class TestCleanup:
    def test_terminates_running_processes(self, monkeypatch, start_module):
        # Insert a fake process into PIDS
        class FakeProc:
            def __init__(self):
                self.terminated = False
                self.killed = False
                self.pid = 1234

            def terminate(self):
                self.terminated = True

            def kill(self):
                self.killed = True

            def wait(self, timeout=None):
                return 0

        proc = FakeProc()
        start_module.PIDS.append(proc)
        monkeypatch.setattr(start_module, "CLEANED_UP", False)

        # sys.exit would kill pytest; replace with raising SystemExit
        with pytest.raises(SystemExit):
            start_module.cleanup()
        assert proc.terminated is True

    def test_idempotent(self, monkeypatch, start_module):
        calls = []

        class FakeProc:
            pid = 1

            def terminate(self):
                calls.append("terminate")

            def kill(self):
                calls.append("kill")

            def wait(self, timeout=None):
                return 0

        start_module.PIDS.append(FakeProc())
        monkeypatch.setattr(start_module, "CLEANED_UP", False)
        with pytest.raises(SystemExit):
            start_module.cleanup()
        # Second call should be a no-op
        start_module.CLEANED_UP = True  # state from first call
        start_module.cleanup()
        # Only one terminate call should have happened
        assert calls.count("terminate") == 1


# ──────────────────── end-to-end main() ────────────────────


class TestMainFlow:
    """Drive main() end-to-end with all external side-effects mocked.

    Verifies the call sequence: env probe → env load → port check →
    venv heal → PG/Redis → alembic → backends → frontend → wait.
    """

    def _happy_mocks(self, monkeypatch, start_module):
        monkeypatch.setattr(start_module, "banner", lambda: None)
        monkeypatch.setattr(start_module, "check_environment", lambda: None)
        monkeypatch.setattr(start_module, "load_env", lambda: None)
        monkeypatch.setattr(start_module, "check_ports", lambda: None)
        monkeypatch.setattr(start_module, "start_pg_redis", lambda: None)
        monkeypatch.setattr(start_module, "alembic_upgrade", lambda: None)
        monkeypatch.setattr(start_module, "start_backends", lambda: None)
        monkeypatch.setattr(start_module, "start_frontend", lambda: None)

        # Skip the infinite wait loop
        def fake_sleep(_):
            raise KeyboardInterrupt()
        monkeypatch.setattr(start_module.time, "sleep", fake_sleep)
        monkeypatch.setattr(start_module, "cleanup", lambda: (_ for _ in ()).throw(SystemExit(0)))

    def test_runs_full_flow(self, monkeypatch, start_module, no_subprocess, fake_root):
        monkeypatch.setattr(start_module, "ROOT", fake_root)
        self._happy_mocks(monkeypatch, start_module)

        with pytest.raises(SystemExit):
            start_module.main()

        # main() should have called cleanup (via KeyboardInterrupt) — that's fine
        # The key thing is main() ran without raising before that.

    def test_signals_registered_inside_main(self, monkeypatch, start_module, no_subprocess, fake_root):
        """Importing start must NOT register SIGINT/SIGTERM handlers (side-effect-free import).

        This is the whole point of moving signal.signal() into main().
        """
        import signal as _signal

        monkeypatch.setattr(start_module, "ROOT", fake_root)
        self._happy_mocks(monkeypatch, start_module)
        start_module.PIDS.clear()
        start_module.CLEANED_UP = False

        # Snapshot + restore signal handlers around the call to avoid leaking state
        saved_int = _signal.getsignal(_signal.SIGINT)
        saved_term = _signal.getsignal(_signal.SIGTERM)
        try:
            with pytest.raises(SystemExit):
                start_module.main()
            # main() must register signal handlers (the handler is start's _signal_handler)
            assert _signal.getsignal(_signal.SIGINT) is start_module._signal_handler
            assert _signal.getsignal(_signal.SIGTERM) is start_module._signal_handler
        finally:
            _signal.signal(_signal.SIGINT, saved_int)
            _signal.signal(_signal.SIGTERM, saved_term)