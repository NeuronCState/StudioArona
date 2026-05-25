"""network.list_devices Skill handler."""

from __future__ import annotations

import random
import time
from dataclasses import dataclass
from typing import Any


@dataclass
class Context:
    is_mock: bool = False
    network_scanner: Any = None


@dataclass
class Result:
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None


_MOCK_DEVICES = [
    {"ip": "192.168.1.1", "mac": "AA:BB:CC:DD:EE:01", "hostname": "router", "vendor": "TP-Link"},
    {"ip": "192.168.1.10", "mac": "AA:BB:CC:DD:EE:10", "hostname": "zhang-mbp", "vendor": "Apple"},
    {"ip": "192.168.1.11", "mac": "AA:BB:CC:DD:EE:11", "hostname": "li-desktop", "vendor": "Dell"},
    {"ip": "192.168.1.12", "mac": "AA:BB:CC:DD:EE:12", "hostname": "wang-laptop", "vendor": "Lenovo"},
    {"ip": "192.168.1.20", "mac": "AA:BB:CC:DD:EE:20", "hostname": "nas-synology", "vendor": "Synology"},
    {"ip": "192.168.1.21", "mac": "AA:BB:CC:DD:EE:21", "hostname": "vm-host", "vendor": "Dell"},
    {"ip": "192.168.1.30", "mac": "AA:BB:CC:DD:EE:30", "hostname": "printer-ricoh", "vendor": "Ricoh"},
    {"ip": "192.168.1.31", "mac": "AA:BB:CC:DD:EE:31", "hostname": "camera-entrance", "vendor": "Hikvision"},
    {"ip": "192.168.1.40", "mac": "AA:BB:CC:DD:EE:40", "hostname": "pi-display", "vendor": "Raspberry Pi"},
    {"ip": "192.168.1.41", "mac": "AA:BB:CC:DD:EE:41", "hostname": "esp32-sensor", "vendor": "Espressif"},
    {"ip": "192.168.1.50", "mac": "AA:BB:CC:DD:EE:50", "hostname": "ha-server", "vendor": "Intel NUC"},
    {"ip": "192.168.1.100", "mac": "AA:BB:CC:DD:EE:FF", "hostname": "javis-main", "vendor": "Custom"},
]


async def handler(ctx: Context, **inputs: Any) -> Result:
    if ctx.is_mock:
        return _mock_list()

    if ctx.network_scanner is None:
        return Result(ok=False, error="Network scanner not available")

    try:
        devices = await ctx.network_scanner.scan()
        return Result(ok=True, data={"devices": [d.model_dump() for d in devices]})
    except Exception as e:
        return Result(ok=False, error=str(e))


def _mock_list() -> Result:
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    devices = []
    for d in _MOCK_DEVICES:
        online = random.random() > 0.15
        devices.append({**d, "online": online, "last_seen": now})
    return Result(ok=True, data={"devices": devices})
