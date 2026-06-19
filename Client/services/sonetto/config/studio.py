"""Studio Arona-owned runtime configuration for the bundled agent."""

from pathlib import Path
from typing import Any

import portalocker
import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "studio_config.yaml"

DEFAULT_CONFIG: dict[str, Any] = {"disabled_tools": [], "mcp_servers": {}}


def load_studio_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        return {**DEFAULT_CONFIG}
    with portalocker.Lock(str(CONFIG_PATH) + ".lock", timeout=5):
        raw = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
    return {**DEFAULT_CONFIG, **raw}


def save_studio_config(config: dict[str, Any]) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with portalocker.Lock(str(CONFIG_PATH) + ".lock", timeout=5):
        CONFIG_PATH.write_text(
            yaml.safe_dump(config, allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )


def disabled_tools() -> set[str]:
    return set(load_studio_config().get("disabled_tools", []))


def mcp_servers() -> dict[str, dict[str, Any]]:
    servers = load_studio_config().get("mcp_servers", {})
    return servers if isinstance(servers, dict) else {}
