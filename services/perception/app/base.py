"""Speech engine abstract interface."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class TranscriptionResult:
    text: str
    language: str = "zh"
    emotion: str = "neutral"
    segments: list[dict] = field(default_factory=list)


class SpeechEngine(Protocol):
    """Protocol for speech-to-text engines."""

    async def transcribe(self, audio_path: str | bytes) -> TranscriptionResult: ...

    @property
    def model_name(self) -> str: ...
