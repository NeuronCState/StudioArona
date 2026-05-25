"""Linux NetworkScanner — nmap + ARP + SNMP.

Placeholder for Linux stage.
"""

from __future__ import annotations

from app.core.network.base import DeviceDetail, NetworkDevice


class LinuxNetworkScanner:
    """Real network scanner via nmap. Not yet implemented."""

    async def scan(self) -> list[NetworkDevice]:
        raise NotImplementedError("Linux network: nmap scanner pending Linux stage")

    async def device_info(self, ip: str) -> DeviceDetail:
        raise NotImplementedError("Linux network: nmap scanner pending Linux stage")
