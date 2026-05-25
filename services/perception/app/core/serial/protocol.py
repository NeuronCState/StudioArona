"""Serial protocol codec — frame encoding/decoding + CRC16.

Protocol (03 规划书 §5.2):
  [0xAA][len][cmd][payload...][crc16]

cmd=0x01: set target offset
  payload: int16 dx, int16 dy, uint16 depth_mm (little-endian)

Protocol freeze: W2 end (docs/adr/0003-serial-protocol.md)
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

# Protocol constants
START_BYTE = 0xAA
CMD_SET_TARGET = 0x01


@dataclass
class TargetOffset:
    """Target offset command payload."""

    dx: int  # int16 — horizontal offset
    dy: int  # int16 — vertical offset
    depth_mm: int  # uint16 — depth in millimeters


@dataclass
class SerialFrame:
    """Parsed serial frame."""

    cmd: int
    payload: bytes
    crc: int


def encode_target(dx: int, dy: int, depth_mm: int) -> bytes:
    """Encode a cmd=0x01 target offset frame.

    Returns complete frame with header + payload + CRC.
    """
    payload = struct.pack("<hhH", dx, dy, depth_mm)
    length = len(payload) + 2  # cmd(1) + payload + crc(2)
    header = bytes([START_BYTE, length, CMD_SET_TARGET])
    frame = header + payload
    crc = crc16_ccitt(frame)
    return frame + struct.pack("<H", crc)


def decode_frame(data: bytes) -> SerialFrame | None:
    """Decode a serial frame. Returns None if invalid/incomplete.

    Validates: start byte, length, CRC.
    """
    if len(data) < 5:  # min: start(1) + len(1) + cmd(1) + crc(2)
        return None
    if data[0] != START_BYTE:
        return None

    length = data[1]
    if len(data) < 3 + length:  # start + len + cmd + (length-2) payload + 2 crc
        return None

    cmd = data[2]
    payload = data[3 : 3 + length - 2]  # exclude cmd and crc from payload
    crc_received = struct.unpack_from("<H", data, 3 + length - 2)[0]

    # Verify CRC over everything before CRC
    crc_computed = crc16_ccitt(data[: 3 + length - 2])
    if crc_computed != crc_received:
        return None

    return SerialFrame(cmd=cmd, payload=payload, crc=crc_received)


def decode_target(frame: SerialFrame) -> TargetOffset | None:
    """Decode a cmd=0x01 frame into TargetOffset."""
    if frame.cmd != CMD_SET_TARGET:
        return None
    if len(frame.payload) < 6:
        return None

    dx, dy, depth = struct.unpack_from("<hhH", frame.payload, 0)
    return TargetOffset(dx=dx, dy=dy, depth_mm=depth)


def crc16_ccitt(data: bytes) -> int:
    """CRC16-CCITT (0xFFFF init, poly 0x1021)."""
    crc = 0xFFFF
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = (crc << 1) ^ 0x1021
            else:
                crc <<= 1
            crc &= 0xFFFF
    return crc
