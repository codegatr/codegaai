"""
codegaai.api.routes.mobile
============================

Faz 30 — Mobil API & PWA

GET /api/mobile/status     — Bağlantı durumu
GET /api/mobile/qr         — QR kod (yerel ağda bağlantı)
GET /manifest.json         — PWA manifest (server.py'de mount edilir)
"""

from __future__ import annotations

import socket
from fastapi import APIRouter
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


def _get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


@router.get("/status")
async def mobile_status() -> dict:
    from codegaai.core.engine import LLMEngine
    ip = _get_local_ip()
    return {
        "local_ip": ip,
        "port": 8765,
        "url": f"http://{ip}:8765",
        "qr_url": f"/api/mobile/qr",
        "llm_ready": LLMEngine.get().is_ready,
        "note": "Aynı WiFi ağında http://{ip}:8765 adresine bağlanın",
    }


@router.get("/qr")
async def mobile_qr():
    """QR kod PNG döndür — telefon tarayıcısı ile tara."""
    from fastapi.responses import Response
    ip = _get_local_ip()
    url = f"http://{ip}:8765"

    try:
        import qrcode, io
        qr = qrcode.QRCode(box_size=8, border=2)
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return Response(content=buf.getvalue(), media_type="image/png")
    except ImportError:
        # qrcode yoksa metin döndür
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(f"QR için: pip install qrcode[pil]\nURL: {url}")
