"""Mock speech engine for development without model download."""

from __future__ import annotations

from app.core.speech.base import SpeechEngine, TranscriptionResult


class MockSpeechEngine:
    def __init__(self) -> None:
        self._model_name = "mock-speech"

    @property
    def model_name(self) -> str:
        return self._model_name

    async def transcribe(self, audio_path: str | bytes) -> TranscriptionResult:
        return TranscriptionResult(
            text="[mock 语音识别结果] 这是一段模拟的转写文本。",
            language="zh",
            emotion="neutral",
        )
