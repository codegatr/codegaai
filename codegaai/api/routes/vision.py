"""
Vision & Video Anlama uç noktaları (Faz 11).

POST /api/vision/analyze          — görüntüyü analiz et
POST /api/vision/ocr              — görüntüden metin çıkar
POST /api/vision/video/analyze    — video analiz et
POST /api/vision/video/transcribe — video transkript
GET  /api/vision/models           — mevcut vision modelleri
POST /api/vision/load             — vision modeli yükle
POST /api/vision/unload           — vision modeli bellekten çıkar
GET  /api/vision/status           — vision motoru durumu
"""

from __future__ import annotations

import base64
import os
import tempfile
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()

MAX_IMAGE_MB = 20
MAX_VIDEO_MB = 500


# ============================================================
# Durum + Model yönetimi
# ============================================================

@router.get("/status")
async def status() -> dict:
    from codegaai.core.vision_engine import VisionEngine
    from codegaai.core.ocr_engine import OCREngine
    return {
        "vision": VisionEngine.get().status,
        "ocr": {
            "available": OCREngine.get().available,
            "backend": OCREngine.get().backend_name,
        },
        "phase": "Faz 11",
    }


@router.get("/models")
async def list_models() -> dict:
    from codegaai.core.vision_engine import VISION_MODELS
    return {
        "models": [
            {
                "id": m.id,
                "name": m.name,
                "size_gb": m.size_gb,
                "vram_gb": m.vram_gb,
                "description": m.description,
                "default": m.default,
            }
            for m in VISION_MODELS
        ]
    }


class LoadRequest(BaseModel):
    model_id: str = "moondream2"


@router.post("/load")
async def load_model(req: LoadRequest) -> dict:
    from codegaai.core.vision_engine import VisionEngine
    engine = VisionEngine.get()
    if engine.is_ready and engine._status.model_id == req.model_id:
        return {"already_loaded": True, "status": engine.status}

    # Arka planda yükle
    import threading

    def _load():
        try:
            engine.load(req.model_id)
        except Exception as exc:
            log.error("Vision yükleme hatası: %s", exc)

    threading.Thread(target=_load, daemon=True, name="vision-load").start()
    return {"loading": True, "model_id": req.model_id}


@router.post("/unload")
async def unload_model() -> dict:
    from codegaai.core.vision_engine import VisionEngine
    VisionEngine.get().unload()
    return {"unloaded": True}


# ============================================================
# Görüntü Analizi
# ============================================================

@router.post("/analyze")
async def analyze_image(
    file: UploadFile = File(...),
    question: str = Form("Bu görüntüde ne var? Detaylı anlat."),
    max_tokens: int = Form(512),
    auto_load: bool = Form(True),
) -> dict:
    """
    Görüntü yükle, soruyu yanıtla.
    Multipart form: file + question + max_tokens
    """
    from codegaai.core.vision_engine import VisionEngine

    # Boyut kontrolü
    content = await file.read()
    if len(content) > MAX_IMAGE_MB * 1024 * 1024:
        raise HTTPException(413, f"Görüntü {MAX_IMAGE_MB} MB sınırını aşıyor")

    engine = VisionEngine.get()
    if not engine.is_ready:
        if auto_load:
            engine.load("moondream2")
        else:
            raise HTTPException(409, "Vision modeli yüklü değil")

    t0 = time.time()
    result = engine.analyze(
        question=question,
        image_bytes=content,
        max_tokens=max_tokens,
    )
    elapsed = int((time.time() - t0) * 1000)

    return {
        "question": question,
        "answer": result,
        "model": engine._status.model_id,
        "elapsed_ms": elapsed,
    }


@router.post("/analyze/b64")
async def analyze_image_b64(body: dict) -> dict:
    """
    Base64 görüntü ile analiz (JSON body).
    {image_b64, question, max_tokens}
    """
    from codegaai.core.vision_engine import VisionEngine

    image_b64 = body.get("image_b64")
    if not image_b64:
        raise HTTPException(422, "image_b64 zorunlu")

    question = body.get("question", "Bu görüntüde ne var?")
    max_tokens = int(body.get("max_tokens", 512))

    engine = VisionEngine.get()
    if not engine.is_ready:
        engine.load("moondream2")

    t0 = time.time()
    result = engine.analyze(
        question=question,
        image_b64=image_b64,
        max_tokens=max_tokens,
    )
    elapsed = int((time.time() - t0) * 1000)

    return {
        "question": question,
        "answer": result,
        "model": engine._status.model_id,
        "elapsed_ms": elapsed,
    }


# ============================================================
# OCR
# ============================================================

@router.post("/ocr")
async def ocr(
    file: UploadFile = File(...),
    languages: str = Form("tr,en"),
    detail: int = Form(0),
) -> dict:
    """Görüntüden metin çıkar (OCR)."""
    from codegaai.core.ocr_engine import OCREngine

    content = await file.read()
    if len(content) > MAX_IMAGE_MB * 1024 * 1024:
        raise HTTPException(413, f"Görüntü {MAX_IMAGE_MB} MB sınırını aşıyor")

    langs = [l.strip() for l in languages.split(",")]
    engine = OCREngine.get()

    if not engine.available:
        raise HTTPException(503, "OCR kullanılamıyor. EasyOCR veya Tesseract kur.")

    t0 = time.time()
    text = engine.extract_text(
        image_bytes=content,
        languages=langs,
        detail=detail,
    )
    elapsed = int((time.time() - t0) * 1000)

    return {
        "text": text,
        "backend": engine.backend_name,
        "languages": langs,
        "elapsed_ms": elapsed,
    }


# ============================================================
# Video Analizi
# ============================================================

@router.post("/video/analyze")
async def analyze_video(
    file: UploadFile = File(...),
    question: str = Form("Bu videoda ne oluyor? Detaylı anlat."),
    max_frames: int = Form(8),
    auto_load: bool = Form(True),
) -> dict:
    """Video yükle ve analiz et."""
    from codegaai.core.video_analyzer import VideoAnalyzer

    content = await file.read()
    if len(content) > MAX_VIDEO_MB * 1024 * 1024:
        raise HTTPException(413, f"Video {MAX_VIDEO_MB} MB sınırını aşıyor")

    # Geçici dosyaya yaz
    suffix = Path(file.filename or "video.mp4").suffix or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = VideoAnalyzer.get().analyze(
            video_path=tmp_path,
            question=question,
            max_frames=max_frames,
            auto_load_vision=auto_load,
        )
        return result.to_dict()
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@router.post("/video/transcribe")
async def transcribe_video(
    file: UploadFile = File(...),
    interval_s: float = Form(30.0),
    question: str = Form("Bu karede ne oluyor?"),
) -> dict:
    """Video transkripti oluştur."""
    from codegaai.core.video_analyzer import VideoAnalyzer

    content = await file.read()
    suffix = Path(file.filename or "video.mp4").suffix or ".mp4"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        transcript = VideoAnalyzer.get().transcribe(
            video_path=tmp_path,
            interval_s=interval_s,
            question=question,
        )
        return {"transcript": transcript}
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
