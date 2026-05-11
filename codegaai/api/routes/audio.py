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


# ── Streaming Ses Sohbeti (Faz 22) ────────────────────────────────────────

@router.post("/voice-chat")
async def voice_chat(audio: UploadFile = File(...),
                     language: Optional[str] = Form("tr"),
                     chat_id: Optional[int] = Form(None)) -> dict:
    """
    Tam döngü ses sohbeti:
    1. Ses → ASR (Whisper) → metin
    2. Metin → LLM → cevap
    3. Cevap → TTS (Piper/XTTS) → ses
    Döndürür: {transcript, response, audio_b64, audio_url}
    """
    import tempfile, shutil, base64
    from pathlib import Path

    asr_eng = ASREngine.get()
    tts_eng = TTSEngine.get()

    # 1. ASR — sesi metne çevir
    suffix = Path(audio.filename or "mic.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(audio.file, tmp)
        tmp_path = tmp.name

    transcript = ""
    try:
        if asr_eng.is_ready:
            asr_result = asr_eng.transcribe(tmp_path, language=language)
            transcript = asr_result.get("text", "").strip()
        else:
            return {"error": "ASR motoru yüklü değil"}
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    if not transcript:
        return {"error": "Ses anlaşılamadı", "transcript": ""}

    log.info("Voice chat ASR: %s", transcript[:80])

    # 2. LLM — cevap üret
    try:
        from codegaai.core.engine import LLMEngine, GenerationConfig
        from codegaai.core.system_prompt import build_system_prompt
        from codegaai.core.chat_store import ChatStore

        engine = LLMEngine.get()
        if not engine.is_ready:
            return {"transcript": transcript, "error": "LLM yüklü değil"}

        history = []
        if chat_id:
            try:
                store = ChatStore.open()
                msgs = store.get_messages(chat_id, limit=10)
                history = [{"role": m["role"], "content": m["content"]} for m in msgs]
            except Exception:
                pass

        # Ses sohbeti için kısa ve öz cevap
        sys_prompt = build_system_prompt() + "\n\nSes sohbetindesin. KISA ve öz cevap ver (1-3 cümle). Sesli okunacak, markdown kullanma."
        messages = [{"role": "system", "content": sys_prompt}]
        messages.extend(history)
        messages.append({"role": "user", "content": transcript})

        response = ""
        for tok in engine.stream(messages, cfg=GenerationConfig(max_tokens=150, temperature=0.7)):
            response += tok
        response = response.strip()
    except Exception as e:
        return {"transcript": transcript, "error": f"LLM hatası: {e}"}

    log.info("Voice chat LLM: %s", response[:80])

    # 3. TTS — cevabı sese çevir
    audio_b64 = ""
    audio_url = ""
    try:
        if tts_eng.is_ready:
            tts_result = tts_eng.synthesize(text=response, language=language or "tr")
            audio_url = tts_result.get("url", "")
            # Base64 da döndür (UI için)
            if audio_url:
                from codegaai.config import DATA_DIR
                audio_path = DATA_DIR / audio_url.lstrip("/")
                if audio_path.exists():
                    audio_b64 = base64.b64encode(audio_path.read_bytes()).decode()
    except Exception as e:
        log.warning("TTS hatası: %s", e)

    # Sohbet geçmişine kaydet
    if chat_id and response:
        try:
            store = ChatStore.open()
            store.add_message(chat_id, "user", f"🎤 {transcript}")
            store.add_message(chat_id, "assistant", response)
        except Exception:
            pass

    return {
        "transcript": transcript,
        "response": response,
        "audio_b64": audio_b64,
        "audio_url": audio_url,
    }


@router.get("/stream-tts")
async def stream_tts(text: str, language: str = "tr"):
    """TTS'i streaming olarak döndür (WAV chunks)."""
    from fastapi.responses import StreamingResponse
    from codegaai.core.tts_engine import TTSEngine as _TTS
    import io

    eng = _TTS.get()
    if not eng.is_ready:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "TTS hazır değil"}, 409)

    result = eng.synthesize(text=text, language=language)
    url = result.get("url", "")
    if not url:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "Ses üretilemedi"}, 500)

    from codegaai.config import DATA_DIR
    path = DATA_DIR / url.lstrip("/")
    if not path.exists():
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "Dosya bulunamadı"}, 404)

    def _gen():
        with open(path, "rb") as f:
            while chunk := f.read(4096):
                yield chunk

    return StreamingResponse(_gen(), media_type="audio/wav",
                             headers={"Accept-Ranges": "bytes"})
