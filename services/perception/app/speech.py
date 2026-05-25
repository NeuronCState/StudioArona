"""Speech API — /api/speech/* routes.

POST /api/speech/transcribe — upload audio file, return transcription
"""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter(prefix="/api/speech", tags=["Speech"])

# Module-level singleton per ruff B008
_file_param = File(...)


def _get_engine():
    from app.core.factory import create_speech_engine

    return create_speech_engine()


@router.post("/transcribe")
async def transcribe(file: UploadFile = _file_param) -> dict:
    """Transcribe an audio file (WAV, MP3, FLAC, etc.).

    Returns: { text, language, emotion, segments }
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    allowed = {
        "audio/wav",
        "audio/x-wav",
        "audio/mpeg",
        "audio/mp3",
        "audio/flac",
        "audio/ogg",
        "audio/webm",
        "audio/x-m4a",
    }
    if file.content_type and file.content_type not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format: {file.content_type}",
        )

    audio_bytes = await file.read()
    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file")

    engine = _get_engine()
    result = await engine.transcribe(audio_bytes)

    return {
        "text": result.text,
        "language": result.language,
        "emotion": result.emotion,
        "segments": result.segments,
        "model": engine.model_name,
    }
