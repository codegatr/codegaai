"""
codegaai.api.routes.wakeword
==============================

Faz 26 — Wake Word API

GET  /api/wakeword/status   — Durum
POST /api/wakeword/start    — Dinlemeyi başlat
POST /api/wakeword/stop     — Durdur
GET  /api/wakeword/deps     — Gereksinimler yüklü mü?
"""

from __future__ import annotations

from fastapi import APIRouter
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.get("/status")
async def status() -> dict:
    from codegaai.core.wake_word import WakeWordEngine
    return WakeWordEngine.get().status


@router.post("/start")
async def start() -> dict:
    from codegaai.core.wake_word import WakeWordEngine

    def on_wake(transcript: str):
        """Wake word algılandı — voice-chat başlat."""
        log.info("Wake: '%s' → ses sohbeti başlatılıyor", transcript)
        # UI'ya bildir (WebSocket veya polling ile)
        # Şimdilik sadece log

    return WakeWordEngine.get().start(callback=on_wake)


@router.post("/stop")
async def stop() -> dict:
    from codegaai.core.wake_word import WakeWordEngine
    WakeWordEngine.get().stop()
    return {"ok": True}


@router.get("/deps")
async def check_deps() -> dict:
    import importlib
    deps = {
        "openwakeword": importlib.util.find_spec("openwakeword") is not None,
        "pvporcupine": importlib.util.find_spec("pvporcupine") is not None,
        "sounddevice": importlib.util.find_spec("sounddevice") is not None,
        "faster_whisper": importlib.util.find_spec("faster_whisper") is not None,
    }
    ready = deps["sounddevice"] and (deps["openwakeword"] or
                                      deps["pvporcupine"] or
                                      deps["faster_whisper"])
    return {
        "ready": ready,
        "deps": deps,
        "install": "pip install openwakeword sounddevice" if not ready else "",
    }
