"""FunASR speech engine using SenseVoiceSmall for ASR + emotion + language ID."""

from __future__ import annotations

import structlog

from app.core.speech.base import SpeechEngine, TranscriptionResult

logger = structlog.get_logger(service="perception.speech")


class FunASREngine:
    """Speech-to-text via FunASR SenseVoiceSmall.

    Supports: zh, yue, en, ja, ko
    Outputs: transcription + emotion + language ID
    """

    def __init__(self, model: str = "iic/SenseVoiceSmall", device: str = "cpu") -> None:
        self._model_name = model
        self._device = device
        self._pipeline = None
        self._ready = False

    @property
    def model_name(self) -> str:
        return self._model_name

    async def _ensure_loaded(self) -> None:
        if self._ready:
            return
        import funasr

        logger.info("loading_funasr_model", model=self._model_name, device=self._device)
        self._pipeline = funasr.AutoModel(
            model=self._model_name,
            device=self._device,
            disable_pbar=True,
        )
        self._ready = True
        logger.info("funasr_model_loaded", model=self._model_name)

    async def transcribe(self, audio_path: str | bytes) -> TranscriptionResult:
        await self._ensure_loaded()

        input_ = audio_path if isinstance(audio_path, str) else audio_path
        result = self._pipeline.generate(
            input=input_,
            language="auto",
            use_itn=False,
        )

        if not result:
            return TranscriptionResult(text="", language="unknown", emotion="neutral")

        item = result[0] if isinstance(result, list) else result
        text = item.get("text", "")

        # SenseVoice output format: "<|zh|><|NEUTRAL|><|Speech|><|woitn|>你好..."
        emotion = self._parse_emotion_tag(text)
        language = self._parse_lang_tag(text) or "zh"
        clean_text = self._strip_tags(text)

        return TranscriptionResult(
            text=clean_text,
            language=language,
            emotion=emotion,
            segments=[{"text": clean_text, "emotion": emotion}],
        )

    @staticmethod
    def _parse_emotion_tag(raw: str) -> str:
        tags = ["HAPPY", "SAD", "ANGRY", "NEUTRAL", "SURPRISED", "FEARFUL", "DISGUSTED"]
        for t in tags:
            if f"<|{t}|>" in raw:
                return t.lower()
        return "neutral"

    @staticmethod
    def _parse_lang_tag(raw: str) -> str | None:
        known = {"zh", "en", "ja", "ko", "yue", "auto"}
        for lang in known:
            if f"<|{lang}|>" in raw:
                return lang
        return None

    @staticmethod
    def _strip_tags(raw: str) -> str:
        import re

        return re.sub(r"<\|[^|]+\|>", "", raw).strip()
