"""
Ses uç noktaları (Faz 5).

POST /api/audio/tts          — metni sese çevir
POST /api/audio/asr          — sesi metne çevir (multipart upload)
GET  /api/audio/list         — üretilen ses dosyalarını listele
GET  /api/audio/status       — TTS + ASR motor durumları
"""

from __future__ import annotations

import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from codegaai.config import OUTPUTS_DIR
from codegaai.core.audio_engine import (
    AUDIO_OUTPUT_DIR,
    ASREngine,
    TTSEngine,
)
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    language: str = Field("tr", min_length=2, max_length=5)
    speaker_wav: Optional[str] = None       # XTTS: ses kopyalama referansı
    speaker: Optional[str] = None            # XTTS: önceden tanımlı konuşmacı


@router.post("/tts")
async def synthesize(req: TTSRequest) -> dict:
    eng = TTSEngine.get()
    if not eng.is_ready:
        raise HTTPException(
            409,
            "TTS motoru yüklü değil. Sistem → Ses Modelleri'nden bir TTS "
            "modeli indir ve yükle (örn. XTTS v2)."
        )

    try:
        return eng.synthesize(
            text=req.text, language=req.language,
            speaker_wav=req.speaker_wav, speaker=req.speaker,
        )
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))
    except Exception as exc:
        log.exception("TTS hatası: %s", exc)
        raise HTTPException(500, f"TTS hatası: {exc}")


@router.post("/asr")
async def transcribe(audio: UploadFile = File(...),
                      language: Optional[str] = Form(None),
                      task: str = Form("transcribe")) -> dict:
    eng = ASREngine.get()
    if not eng.is_ready:
        raise HTTPException(
            409,
            "ASR motoru yüklü değil. Sistem → Ses Modelleri'nden Faster "
            "Whisper indir ve yükle."
        )

    # Geçici dosyaya yaz
    suffix = Path(audio.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        try:
            shutil.copyfileobj(audio.file, tmp)
            tmp_path = tmp.name
        finally:
            audio.file.close()

    try:
        result = eng.transcribe(tmp_path, language=language, task=task)
        return result
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))
    except Exception as exc:
        log.exception("ASR hatası: %s", exc)
        raise HTTPException(500, f"ASR hatası: {exc}")
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@router.get("/list")
async def list_audio(limit: int = 50) -> dict:
    """Üretilen TTS dosyaları."""
    if not AUDIO_OUTPUT_DIR.exists():
        return {"files": []}
    files = sorted(
        AUDIO_OUTPUT_DIR.glob("*.wav"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )[:limit]

    return {
        "files": [
            {
                "id": p.stem,
                "filename": p.name,
                "url": f"/outputs/audio/{p.name}",
                "size_bytes": p.stat().st_size,
                "created": datetime.fromtimestamp(p.stat().st_mtime).isoformat(),
            }
            for p in files
        ],
    }


@router.delete("/{audio_id}")
async def delete_audio(audio_id: str) -> dict:
    candidates = list(AUDIO_OUTPUT_DIR.glob(f"{audio_id}*.wav")) + \
                 list(AUDIO_OUTPUT_DIR.glob(f"tts-{audio_id}*.wav"))
    if not candidates:
        raise HTTPException(404, "Ses dosyası bulunamadı")
    for p in candidates:
        p.unlink()
    return {"deleted": len(candidates)}


@router.get("/voices")
async def voices() -> dict:
    """XTTS önceden tanımlı konuşmacılar."""
    eng = TTSEngine.get()
    if not eng.is_ready:
        return {"voices": [], "languages": []}
    # XTTS speaker_manager'dan al (yüklenmiş ise)
    try:
        if hasattr(eng._tts, "speakers"):
            return {
                "voices": list(eng._tts.speakers) if eng._tts.speakers else [],
                "languages": eng.status["languages"],
            }
    except Exception:
        pass
    return {"voices": [], "languages": eng.status["languages"]}


@router.get("/status")
async def status() -> dict:
    tts = TTSEngine.get()
    asr = ASREngine.get()
    return {
        "tts": tts.status,
        "asr": asr.status,
        "phase": "Faz 5",
    }
