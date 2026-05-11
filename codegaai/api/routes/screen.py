"""
codegaai.api.routes.screen
============================

Faz 31 — Canlı Ekran Paylaşımı

POST /api/screen/capture    — Anlık ekran görüntüsü al + analiz et
POST /api/screen/watch      — Periyodik izleme başlat
POST /api/screen/stop       — İzlemeyi durdur
GET  /api/screen/status     — İzleme durumu
GET  /api/screen/latest     — Son analiz sonucu
"""

from __future__ import annotations

import base64
import io
import threading
import time
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()

# İzleme durumu
_watch_state = {
    "running": False,
    "interval": 10,        # saniye
    "last_capture": None,
    "last_analysis": "",
    "last_image_b64": "",
    "capture_count": 0,
    "question": "Ekranda ne var? Değişiklik var mı?",
}
_watch_thread: Optional[threading.Thread] = None


def _take_screenshot() -> Optional[bytes]:
    """Ekran görüntüsü al. mss → PIL → fallback."""
    try:
        import mss, mss.tools
        with mss.mss() as sct:
            monitor = sct.monitors[0]  # Tüm ekranlar
            img = sct.grab(monitor)
            # PNG'ye çevir
            from PIL import Image
            pil_img = Image.frombytes("RGB", img.size, img.bgra, "raw", "BGRX")
            pil_img.thumbnail((1280, 720))  # Boyutu küçült
            buf = io.BytesIO()
            pil_img.save(buf, format="PNG", optimize=True)
            return buf.getvalue()
    except ImportError:
        pass

    # PIL ImageGrab (Windows'ta mss yoksa)
    try:
        from PIL import ImageGrab
        img = ImageGrab.grab()
        img.thumbnail((1280, 720))
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue()
    except Exception as e:
        log.warning("Ekran görüntüsü alınamadı: %s", e)
        return None


def _analyze_screenshot(image_bytes: bytes, question: str) -> str:
    """Vision motoru ile analiz et."""
    try:
        from codegaai.core.vision_engine import VisionEngine
        engine = VisionEngine.get()
        if engine.is_ready:
            result = engine.analyze(image_bytes=image_bytes, question=question)
            return result.get("text", "")
    except Exception as e:
        log.debug("Vision analizi hatası: %s", e)

    # Vision yoksa OCR dene
    try:
        from codegaai.core.ocr_engine import OCREngine
        import tempfile, os
        ocr = OCREngine.get()
        if ocr.available():
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
                tmp.write(image_bytes)
                tmp_path = tmp.name
            try:
                result = ocr.extract(tmp_path)
                return result.get("text", "")[:500]
            finally:
                os.unlink(tmp_path)
    except Exception:
        pass

    return "Vision veya OCR motoru gerekli"


def _watch_loop():
    """Arka planda periyodik ekran analizi."""
    log.info("Ekran izleme başladı (her %ds)", _watch_state["interval"])
    while _watch_state["running"]:
        try:
            img_bytes = _take_screenshot()
            if img_bytes:
                _watch_state["capture_count"] += 1
                _watch_state["last_capture"] = time.strftime("%H:%M:%S")
                _watch_state["last_image_b64"] = base64.b64encode(img_bytes).decode()

                analysis = _analyze_screenshot(img_bytes, _watch_state["question"])
                if analysis:
                    _watch_state["last_analysis"] = analysis
                    log.debug("Ekran analizi: %s", analysis[:100])
        except Exception as e:
            log.warning("Ekran izleme hatası: %s", e)

        time.sleep(_watch_state["interval"])
    log.info("Ekran izleme durduruldu")


# ── API ──────────────────────────────────────────────────────────────────

class CaptureRequest(BaseModel):
    question: str = "Ekranda ne var? Detaylı açıkla."


@router.post("/capture")
async def capture(req: CaptureRequest) -> dict:
    """Anlık ekran görüntüsü al ve analiz et."""
    img_bytes = _take_screenshot()
    if not img_bytes:
        return {"error": "Ekran görüntüsü alınamadı. 'pip install mss Pillow' gerekli."}

    analysis = _analyze_screenshot(img_bytes, req.question)
    img_b64 = base64.b64encode(img_bytes).decode()

    return {
        "analysis": analysis,
        "image_b64": img_b64,
        "question": req.question,
        "timestamp": time.strftime("%H:%M:%S"),
    }


class WatchRequest(BaseModel):
    interval: int = 10      # saniye
    question: str = "Ekranda ne var? Önemli değişiklik var mı?"


@router.post("/watch")
async def start_watch(req: WatchRequest) -> dict:
    """Periyodik izleme başlat."""
    global _watch_thread

    if _watch_state["running"]:
        return {"error": "İzleme zaten çalışıyor"}

    _watch_state["running"] = True
    _watch_state["interval"] = max(5, req.interval)
    _watch_state["question"] = req.question
    _watch_state["capture_count"] = 0

    _watch_thread = threading.Thread(target=_watch_loop, daemon=True, name="screen-watch")
    _watch_thread.start()

    return {"started": True, "interval": _watch_state["interval"]}


@router.post("/stop")
async def stop_watch() -> dict:
    _watch_state["running"] = False
    return {"stopped": True, "total_captures": _watch_state["capture_count"]}


@router.get("/status")
async def watch_status() -> dict:
    return {
        "running": _watch_state["running"],
        "interval": _watch_state["interval"],
        "last_capture": _watch_state["last_capture"],
        "capture_count": _watch_state["capture_count"],
        "last_analysis": _watch_state["last_analysis"][:200] if _watch_state["last_analysis"] else "",
    }


@router.get("/latest")
async def latest_result() -> dict:
    return {
        "analysis": _watch_state["last_analysis"],
        "image_b64": _watch_state["last_image_b64"],
        "timestamp": _watch_state["last_capture"],
        "capture_count": _watch_state["capture_count"],
    }
