"""Shared types for Skill handlers — the hard contract between B and C.

All skill handlers import Context and Result from here.
No SDK, no decorators, pure async function.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class Context:
    is_mock: bool = False
    mock_data_path: str = ""


@dataclass
class Result:
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None
