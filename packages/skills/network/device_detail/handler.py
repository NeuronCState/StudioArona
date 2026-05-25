"""network.device_detail Skill handler."""

from __future__ import annotations

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


_MOCK_DETAILS = {
    "192.168.1.1": {"ip": "192.168.1.1", "mac": "AA:BB:CC:DD:EE:01", "hostname": "router", "vendor": "TP-Link", "online": True, "open_ports": [80, 443, 22], "os_guess": "Linux (OpenWrt)"},
    "192.168.1.10": {"ip": "192.168.1.10", "mac": "AA:BB:CC:DD:EE:10", "hostname": "zhang-mbp", "vendor": "Apple", "online": True, "open_ports": [22, 5000, 7000], "os_guess": "macOS"},
    "192.168.1.11": {"ip": "192.168.1.11", "mac": "AA:BB:CC:DD:EE:11", "hostname": "li-desktop", "vendor": "Dell", "online": True, "open_ports": [22, 3389], "os_guess": "Windows 11"},
    "192.168.1.20": {"ip": "192.168.1.20", "mac": "AA:BB:CC:DD:EE:20", "hostname": "nas-synology", "vendor": "Synology", "online": True, "open_ports": [5000, 5001, 22, 443], "os_guess": "DSM 7.x"},
    "192.168.1.50": {"ip": "192.168.1.50", "mac": "AA:BB:CC:DD:EE:50", "hostname": "ha-server", "vendor": "Intel NUC", "online": True, "open_ports": [8123, 22], "os_guess": "Home Assistant OS"},
    "192.168.1.100": {"ip": "192.168.1.100", "mac": "AA:BB:CC:DD:EE:FF", "hostname": "javis-main", "vendor": "Custom", "online": True, "open_ports": [8000, 8080, 22, 5432], "os_guess": "Ubuntu 22.04"},
}


async def handler(ctx: Context, **inputs: Any) -> Result:
    ip = inputs.get("ip")
    if not ip:
        return Result(ok=False, error="ip is required")

    if ctx.is_mock:
        return _mock_detail(ip)

    if ctx.network_scanner is None:
        return Result(ok=False, error="Network scanner not available")

    try:
        detail = await ctx.network_scanner.device_info(ip)
        return Result(ok=True, data={"device": detail.model_dump()})
    except KeyError:
        return Result(ok=False, error=f"Device {ip} not found")
    except Exception as e:
        return Result(ok=False, error=str(e))


def _mock_detail(ip: str) -> Result:
    detail = _MOCK_DETAILS.get(ip)
    if detail is None:
        # Generate a generic mock for unknown IPs
        detail = {
            "ip": ip,
            "mac": "00:11:22:33:44:55",
            "hostname": f"device-{ip.split('.')[-1]}",
            "vendor": "Unknown",
            "online": True,
            "open_ports": [22],
            "os_guess": "Linux",
        }
    return Result(ok=True, data={"device": detail})
