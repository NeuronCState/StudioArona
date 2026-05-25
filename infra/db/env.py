"""Alembic environment configuration."""

import asyncio
import os
import re
import sys
from logging.config import fileConfig
from pathlib import Path

# Add services/api-gateway to sys.path so `from app.models...` resolves
_project_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_project_root / "services" / "api-gateway"))
sys.path.insert(0, str(_project_root))

# Load .env.local if present
_dotenv_path = _project_root / ".env.local"
if _dotenv_path.exists():
    with open(_dotenv_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _key, _, _val = _line.partition("=")
                if _key not in os.environ:
                    os.environ[_key] = _val

from alembic import context  # noqa: E402
from sqlalchemy import pool  # noqa: E402
from sqlalchemy.ext.asyncio import async_engine_from_config  # noqa: E402

from infra.db.metadata import Base  # noqa: E402

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Expand %(ENV_VAR)s placeholders in config values
_ENV_VAR_RE = re.compile(r"%\((\w+)\)s")


def _expand_env_vars(value: str) -> str:
    def _replace(match):
        return os.environ.get(match.group(1), "")
    return _ENV_VAR_RE.sub(_replace, value)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — generate SQL without DB connection."""
    url = _expand_env_vars(config.get_main_option("sqlalchemy.url"))
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in 'online' mode using async engine."""
    section = {
        k: _expand_env_vars(v) for k, v in config.get_section(
            config.config_ini_section, {}
        ).items()
    }
    connectable = async_engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
