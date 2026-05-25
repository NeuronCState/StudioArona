"""NetworkScanner protocol — abstract interface for network scanning.

Mac mock: 12 fake devices
Linux: nmap + ARP + SNMP (Linux stage)
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from pydantic import BaseModel


class NetworkDevice(BaseModel):
    ip: str
    mac: str
    hostname: str
    vendor: str
    online: bool
    last_seen: str


class DeviceDetail(BaseModel):
    ip: str
    mac: str
    hostname: str
    vendor: str
    online: bool
    open_ports: list[int]
    os_guess: str | None = None


@runtime_checkable
class NetworkScanner(Protocol):
    """Async network scanner protocol."""

    async def scan(self) -> list[NetworkDevice]:
        """Scan local network for devices."""
        ...

    async def device_info(self, ip: str) -> DeviceDetail:
        """Get detailed info for a specific device."""
        ...
