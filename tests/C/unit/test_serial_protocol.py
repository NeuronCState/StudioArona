"""Unit tests for serial protocol codec.

Verifies:
- encode_target produces valid frames
- decode_frame validates start byte, length, CRC
- decode_target unpacks dx, dy, depth correctly
- Round-trip: encode → decode → values match
- CRC error detection
"""

from __future__ import annotations

import struct

import pytest

from app.core.serial.protocol import (
    CMD_SET_TARGET,
    START_BYTE,
    SerialFrame,
    TargetOffset,
    crc16_ccitt,
    decode_frame,
    decode_target,
    encode_target,
)


def test_encode_target_frame_structure():
    """Verify frame: [0xAA][len=8][cmd=0x01][dx:2][dy:2][depth:2][crc:2]"""
    frame = encode_target(100, -50, 1200)
    assert frame[0] == START_BYTE
    assert frame[1] == 8  # len = 6 payload + 2 crc
    assert frame[2] == CMD_SET_TARGET
    assert len(frame) == 11  # 3 header + 6 payload + 2 crc


def test_encode_target_payload():
    """Verify payload is little-endian int16 dx, int16 dy, uint16 depth."""
    frame = encode_target(200, -100, 800)
    dx, dy, depth = struct.unpack_from("<hhH", frame, 3)
    assert dx == 200
    assert dy == -100
    assert depth == 800


def test_encode_target_crc():
    """Verify CRC is appended and correct."""
    frame = encode_target(0, 0, 0)
    # CRC should be non-zero for this frame
    crc = struct.unpack_from("<H", frame, 9)[0]
    assert crc != 0


def test_decode_frame_valid():
    """Decode a valid encoded frame."""
    encoded = encode_target(100, -50, 1200)
    decoded = decode_frame(encoded)
    assert decoded is not None
    assert decoded.cmd == CMD_SET_TARGET
    assert len(decoded.payload) == 6


def test_decode_frame_invalid_start():
    """Invalid start byte should return None."""
    data = bytes([0xBB, 0x08, 0x01]) + bytes(8)
    assert decode_frame(data) is None


def test_decode_frame_too_short():
    """Frame shorter than minimum should return None."""
    assert decode_frame(bytes([0xAA, 0x02, 0x01])) is None


def test_decode_frame_crc_error():
    """Corrupted CRC should return None."""
    encoded = bytearray(encode_target(100, -50, 1200))
    encoded[-1] ^= 0xFF  # corrupt CRC
    assert decode_frame(bytes(encoded)) is None


def test_decode_target_valid():
    """Decode a cmd=0x01 frame into TargetOffset."""
    encoded = encode_target(300, -150, 1500)
    frame = decode_frame(encoded)
    assert frame is not None

    target = decode_target(frame)
    assert target is not None
    assert target.dx == 300
    assert target.dy == -150
    assert target.depth_mm == 1500


def test_decode_target_wrong_cmd():
    """Non-0x01 cmd should return None."""
    frame = SerialFrame(cmd=0x02, payload=bytes(6), crc=0)
    assert decode_target(frame) is None


def test_round_trip():
    """Encode → decode → values should match."""
    test_cases = [
        (0, 0, 0),
        (100, -50, 1200),
        (-32768, 32767, 65535),  # edge values
        (1, -1, 1),
    ]
    for dx, dy, depth in test_cases:
        encoded = encode_target(dx, dy, depth)
        frame = decode_frame(encoded)
        assert frame is not None, f"decode failed for ({dx}, {dy}, {depth})"
        target = decode_target(frame)
        assert target is not None, f"target decode failed for ({dx}, {dy}, {depth})"
        assert target.dx == dx, f"dx mismatch: {target.dx} != {dx}"
        assert target.dy == dy, f"dy mismatch: {target.dy} != {dy}"
        assert target.depth_mm == depth, f"depth mismatch: {target.depth_mm} != {depth}"


def test_crc16_known_value():
    """Verify CRC16 against a known test vector."""
    # "123456789" → CRC16-CCITT = 0x29B1
    data = b"123456789"
    assert crc16_ccitt(data) == 0x29B1
