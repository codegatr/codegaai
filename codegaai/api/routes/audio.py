"""Ses sentezi ve konuşma tanıma uç noktaları (Faz 5 stub)."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()


# ============================================================
# TTS - Text to Speech
# ============================================================

class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    voice: str = "turkish_female_1"
    language: str = "tr"
    speed: float = Field(1.0, ge=0.5, le=2.0)
    model: str = "xtts-v2"


@router.post("/tts")
async def tts(req: TTSRequest) -> dict:
    return {
        "status": "stub",
        "message": "Türkçe ses sentezi Faz 5'te (v0.5.0) aktif olacak.",
        "planned_models": ["XTTS v2 (Coqui)", "Piper (TR)"],
        "received_chars": len(req.text),
    }


# ============================================================
# ASR - Automatic Speech Recognition
# ============================================================

class ASRRequest(BaseModel):
    # Faz 5'te gerçek implement: dosya yükleme veya base64 audio
    language: str = "tr"
    model: str = "faster-whisper-large-v3"


@router.post("/asr")
async def asr(req: ASRRequest) -> dict:
    return {
        "status": "stub",
        "message": "Konuşma tanıma Faz 5'te (v0.5.0) aktif olacak.",
        "planned_models": ["faster-whisper Large v3"],
    }


@router.get("/voices")
async def voices() -> dict:
    """Mevcut TTS sesleri."""
    return {
        "loaded": [],
        "available": [
            {"id": "turkish_female_1", "name": "Ayşe (Türkçe Kadın)",
             "language": "tr", "model": "xtts-v2"},
            {"id": "turkish_male_1", "name": "Mehmet (Türkçe Erkek)",
             "language": "tr", "model": "xtts-v2"},
            {"id": "english_female_1", "name": "Emma (English Female)",
             "language": "en", "model": "xtts-v2"},
            {"id": "english_male_1", "name": "James (English Male)",
             "language": "en", "model": "xtts-v2"},
        ],
    }


@router.get("/status")
async def status() -> dict:
    return {
        "tts": {"active": False, "expected_in": "Faz 5 (v0.5.0)"},
        "asr": {"active": False, "expected_in": "Faz 5 (v0.5.0)"},
    }
