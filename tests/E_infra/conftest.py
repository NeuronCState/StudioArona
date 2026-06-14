"""Shared fixtures for infra/scripts tests.

Add infra/scripts to sys.path so `from start import ...` works,
and provide fixtures for mocking subprocess/signal/shutil.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# infra/scripts/ must be on sys.path so we can `import start`
_SCRIPTS = Path(__file__).parent.parent.parent / "infra" / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import pytest  # noqa: E402
import start as start_mod  # noqa: E402


@pytest.fixture
def start_module(monkeypatch):
    """The start module, with all side-effectful globals reset.

    Tests should mutate this and call its functions directly.
    """
    # Reset module-level state that survives across tests.
    start_mod.PIDS.clear()
    start_mod.CLEANED_UP = False
    yield start_mod


@pytest.fixture
def fake_root(tmp_path, monkeypatch, start_module):
    """Pretend the project root is a fresh tmp_path with required structure.

    Creates:
      - .env.local
      - .env.example
      - .venv/bin/python (a fake executable)
      - infra/compose/docker-compose.yml (empty file, just needs to exist)
    """
    # .env.local
    env_local = tmp_path / ".env.local"
    env_local.write_text(
        "APP_ENV=test\nDATABASE_URL=postgresql+asyncpg://u:p@localhost:5432/db\n"
        "MINIMAX_API_KEY=sk-test-1234567890abcdef\nBRIDGE_PORT=19999\n"
    )
    # .env.example (fallback if .env.local missing)
    (tmp_path / ".env.example").write_text(
        "APP_ENV=development\nDATABASE_URL=postgresql+asyncpg://u:p@localhost:5432/db\n"
    )

    # .venv/bin/python (fake)
    venv_bin = tmp_path / ".venv" / "bin"
    venv_bin.mkdir(parents=True)
    py = venv_bin / "python"
    py.write_text("#!/bin/sh\necho fake-python\n")
    py.chmod(0o755)
    # also a fake alembic for alembic_upgrade
    (venv_bin / "alembic").write_text("#!/bin/sh\necho alembic\n")
    (venv_bin / "alembic").chmod(0o755)
    (venv_bin / "uvicorn").write_text("#!/bin/sh\necho uvicorn\n")
    (venv_bin / "uvicorn").chmod(0o755)

    # infra/compose/docker-compose.yml
    compose_dir = tmp_path / "infra" / "compose"
    compose_dir.mkdir(parents=True)
    (compose_dir / "docker-compose.yml").write_text("services: {}\n")

    # Point start.ROOT at tmp_path so functions look there
    monkeypatch.setattr(start_module, "ROOT", tmp_path)
    monkeypatch.setattr(start_module, "COMPOSE_FILE", compose_dir / "docker-compose.yml")

    # Wipe os.environ pollution from earlier tests
    for k in ("APP_ENV", "DATABASE_URL", "MINIMAX_API_KEY", "BRIDGE_PORT"):
        monkeypatch.delenv(k, raising=False)

    return tmp_path


@pytest.fixture
def no_subprocess(monkeypatch):
    """Default: every subprocess.run call records its argv into a list,
    every subprocess.Popen call records argv + returns a fake process.

    Tests can inspect `subprocess.runs` and `subprocess.popens` to assert
    which external commands the start module tried to invoke.
    """

    class _Recorder:
        def __init__(self):
            self.runs = []
            self.popens = []

    rec = _Recorder()

    def fake_run(argv, **kwargs):
        rec.runs.append((list(argv), kwargs))
        # Default: pretend docker info / pg_isready etc succeed
        from subprocess import CompletedProcess
        return CompletedProcess(argv, 0, stdout="", stderr="")

    def fake_popen(argv, **kwargs):
        rec.popens.append((list(argv), kwargs))

        class _FakeProc:
            pid = 99999

            def __init__(self, argv):
                self._argv = argv

            def terminate(self):
                pass

            def kill(self):
                pass

            def wait(self, timeout=None):
                return 0

            def poll(self):
                return None  # pretend still running

        return _FakeProc(argv)

    monkeypatch.setattr("subprocess.run", fake_run)
    monkeypatch.setattr("subprocess.Popen", fake_popen)
    return rec