"""nas/status Skill handler — NAS storage status overview."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class Context:
    is_mock: bool = False


@dataclass
class Result:
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None


async def handler(ctx: Context, **inputs: Any) -> Result:
    if ctx.is_mock:
        return _mock_status()

    return Result(ok=False, error="NAS backend not available in dev mode")


def _mock_status() -> Result:
    return Result(ok=True, data={
        "nas": {
            "hostname": "studio-nas",
            "model": "Synology DS923+",
            "status": "online",
            "uptime_days": 47,
            "storage": {
                "total_gb": 4096,
                "used_gb": 1843,
                "available_gb": 2253,
                "util_pct": 45,
            },
            "volumes": [
                {"name": "volume1", "total_gb": 2048, "used_gb": 1024, "type": "ssd"},
                {"name": "volume2", "total_gb": 2048, "used_gb": 819, "type": "hdd"},
            ],
            "recent_activity": [
                {"file": "project-archive.tar.gz", "action": "upload", "user": "zhang", "time": "2h ago"},
                {"file": "model-checkpoint.pt", "action": "download", "user": "li", "time": "5h ago"},
            ],
        },
        "mock": True,
    })
