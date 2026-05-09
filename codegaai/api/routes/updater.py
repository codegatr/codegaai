"""
Akıllı Güncelleme uç noktaları (Faz 8).

GET  /api/updater/check    — yeni sürüm kontrolü (GitHub Releases)
GET  /api/updater/status   — indirme/uygulama durumu
POST /api/updater/download — indirmeyi başlat (async)
POST /api/updater/cancel   — indirmeyi iptal et
POST /api/updater/apply    — uygulamayı yeniden başlat ve güncelle
GET  /api/updater/install-dir — kurulum dizini (manuel kopyalama için)
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from codegaai.core.updater import Updater
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.get("/check")
async def check_for_updates(force: bool = False) -> dict:
    """GitHub Releases üzerinden son sürümü kontrol et."""
    upd = Updater.get()
    info = upd.check_for_updates(force=force)
    return {
        "current_version": info.current_version,
        "latest_version": info.latest_version,
        "update_available": info.update_available,
        "asset_name": info.asset_name,
        "asset_size": info.asset_size,
        "release_notes": info.release_notes,
        "release_url": info.release_url,
        "published_at": info.published_at,
        "checked_at": info.checked_at,
        "error": info.error,
    }


@router.get("/status")
async def status() -> dict:
    """Mevcut indirme durumu."""
    upd = Updater.get()
    return {**upd.status, "phase": "Faz 8"}


class DownloadRequest(BaseModel):
    version: str = Field(..., min_length=1, max_length=50)


@router.post("/download")
async def start_download(req: DownloadRequest) -> dict:
    upd = Updater.get()
    try:
        upd.download_async(req.version)
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))
    return {"started": True, "version": req.version,
            "status": upd.status}


@router.post("/cancel")
async def cancel_download() -> dict:
    upd = Updater.get()
    return {"cancelled": upd.cancel_download()}


@router.post("/apply")
async def apply_update() -> dict:
    """
    Self-replace başlat: uygulamayı yeniden başlat ve yeni sürüme geç.
    Bu çağrı uygulamayı kapatacağından (2 sn içinde) cevap dönerse de
    bağlantı sonlanır. UI bunu beklemelidir.
    """
    upd = Updater.get()
    if not upd.is_frozen():
        raise HTTPException(
            409,
            "Otomatik güncelleme sadece .exe sürümünde çalışır. "
            "Python source kullanıyorsanız `git pull` yapın."
        )
    try:
        return upd.apply()
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))


@router.get("/install-dir")
async def install_dir() -> dict:
    """Kurulum dizinini döndür (manuel kopyalama için 'klasörü aç')."""
    upd = Updater.get()
    d = upd.install_dir()
    return {
        "frozen": upd.is_frozen(),
        "install_dir": str(d) if d else None,
        "extracted_dir": upd.status.get("extracted_dir"),
    }


@router.post("/cleanup")
async def cleanup() -> dict:
    """Eski indirme klasörlerini temizle."""
    upd = Updater.get()
    deleted = upd.cleanup_old_downloads(keep_latest=1)
    return {"deleted_count": deleted}
