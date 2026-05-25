"""SerialPort protocol — abstract interface for serial communication.

Protocol frame: [0xAA][len][cmd][payload...][crc16]
cmd=0x01: set target offset, payload = int16 dx, int16 dy, uint16 depth_mm
Protocol freeze: W2 end (docs/adr/0003-serial-protocol.md)
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class SerialPort(Protocol):
    """Async serial port protocol."""

    async def open(self, port: str, baud: int = 115200) -> None:
        """Open serial port."""
        ...

    async def write(self, payload: bytes) -> None:
        """Write raw bytes to serial port."""
        ...

    async def read(self, n: int, timeout_ms: int = 1000) -> bytes:
        """Read up to n bytes with timeout."""
        ...

    async def close(self) -> None:
        """Close serial port."""
        ...
