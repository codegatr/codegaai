"""
codegaai.api.routes.updater  —  Eksiksiz Güncelleme Sistemi (Faz 8)

GET  /api/updater/check           Yeni versiyon var mı?
GET  /api/updater/status          İndirme durumu + mevcut versiyon
GET  /api/updater/progress        İndirme ilerlemesi (poll)
GET  /api/updater/changelog       Tüm sürüm notları (GitHub)
GET  /api/updater/history         Güncelleme geçmişi
GET  /api/updater/backups         Yedek listesi
GET  /api/updater/pending         Bekleyen güncelleme bildirimi
GET  /api/updater/install-dir     Kurulum dizini
POST /api/updater/download        İndirmeyi başlat
POST /api/updater/apply           Güncellemeyi uygula (self-replace)
POST /api/updater/cancel          İndirmeyi iptal et
POST /api/updater/rollback        Yedekten geri dön
POST /api/updater/backup          Manuel yedek al
POST /api/updater/auto            Otomatik kontrol aç/kapat
POST /api/updater/dismiss-pending Bekleyen bildirimi kapat
POST /api/updater/cleanup         Eski dosyaları temizle
"""

from __future__ import annotations
import json, sys, time, threading, zipfile
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel
from codegaai.config import DATA_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()

HISTORY_FILE  = DATA_DIR / "update_history.json"
AUTO_FLAG     = DATA_DIR / "auto_update.flag"
PENDING_FILE  = DATA_DIR / "pending_update.json"
BACKUP_DIR    = DATA_DIR / "backups"


# ── Yardımcılar ──────────────────────────────────────────────────────────

def _cur_ver() -> str:
    try:
        from codegaai import __version__; return __version__
    except Exception: return "?"

def _load_history() -> list:
    try:
        if HISTORY_FILE.exists():
            return json.loads(HISTORY_FILE.read_text("utf-8"))
    except Exception: pass
    return []

def _add_history(event: str, version: str = "", detail: str = "") -> None:
    h = _load_history()
    h.append({"ts": time.strftime("%Y-%m-%d %H:%M:%S"),
               "event": event, "version": version or _cur_ver(), "detail": detail})
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(h[-50:], ensure_ascii=False, indent=2), "utf-8")

def _is_frozen() -> bool:
    return getattr(sys, "frozen", False)

def _install_dir() -> Path | None:
    return Path(sys.executable).parent if _is_frozen() else None


# ── Kontrol ──────────────────────────────────────────────────────────────

@router.get("/check")
async def check(force: bool = False) -> dict:
    from codegaai import __version__
    try:
        from codegaai.core.updater import Updater
        info = Updater.get().check_for_updates(force=force)
        return {
            "current_version":  info.current_version,
            "latest_version":   info.latest_version,
            "update_available": info.update_available,
            "release_notes":    info.release_notes or "",
            "release_url":      info.release_url   or "",
            "asset_size_mb":    round(info.asset_size_bytes / 1_048_576, 1) if info.asset_size_bytes else 0,
            "auto_update":      AUTO_FLAG.exists(),
            "checked_at":       time.strftime("%H:%M:%S"),
        }
    except Exception as e:
        log.warning("Güncelleme kontrolü hatası: %s", e)
        return {
            "current_version":  __version__,
            "latest_version":   __version__,
            "update_available": False,
            "release_notes":    "",
            "release_url":      "",
            "asset_size_mb":    0,
            "auto_update":      AUTO_FLAG.exists(),
            "checked_at":       time.strftime("%H:%M:%S"),
            "error":            str(e),
        }


@router.get("/status")
async def status() -> dict:
    """Eski compat endpoint + tam durum."""
    from codegaai.core.updater import Updater
    upd = Updater.get()
    d   = upd.status                         # mevcut property
    # state → idle ise test'e göre "idle" döndür
    return {**d, "state": d.get("state", "idle"), "phase": "Faz 8"}


# ── İlerleme ─────────────────────────────────────────────────────────────

@router.get("/progress")
async def progress() -> dict:
    from codegaai.core.updater import Updater
    d = Updater.get().status                 # DownloadStatus.to_dict() çağrısı içinde
    total  = d.get("total", 0) or 0
    dl     = d.get("downloaded", 0) or 0
    return {
        "status":        d.get("state", "idle"),
        "version":       d.get("version", ""),
        "downloaded_mb": round(dl   / 1_048_576, 1),
        "total_mb":      round(total/ 1_048_576, 1),
        "percent":       d.get("percent", 0),
        "error":         d.get("error", "") or "",
        "done":          d.get("state") in ("completed", "error", "cancelled"),
    }


# ── Changelog ────────────────────────────────────────────────────────────

@router.get("/changelog")
async def changelog(limit: int = 10) -> dict:
    import httpx
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                "https://api.github.com/repos/codegatr/codegaai/releases",
                params={"per_page": limit},
                headers={"Accept": "application/vnd.github+json"},
            )
        if r.status_code != 200:
            return {"error": f"GitHub {r.status_code}", "releases": []}
        releases = [{
            "version": rel["tag_name"],
            "name":    rel.get("name") or rel["tag_name"],
            "notes":   rel.get("body") or "",
            "date":    (rel.get("published_at") or "")[:10],
            "url":     rel.get("html_url", ""),
        } for rel in r.json()]
        return {"releases": releases}
    except Exception as e:
        return {"error": str(e), "releases": []}


# ── Geçmiş ───────────────────────────────────────────────────────────────

@router.get("/history")
async def history() -> dict:
    return {"history": list(reversed(_load_history()))}


# ── İndirme ──────────────────────────────────────────────────────────────

class DownloadReq(BaseModel):
    version: str = ""

@router.post("/download")
async def download(req: DownloadReq) -> dict:
    from codegaai.core.updater import Updater
    upd = Updater.get()
    if not req.version:
        info = upd.check_for_updates(force=True)
        if not info.update_available:
            return {"error": "Zaten güncelsiniz", "current": info.current_version}
        version = info.latest_version
    else:
        version = req.version
    _auto_backup_silent()
    upd.download_async(version)
    _add_history("download_started", version)
    return {"started": True, "version": version}


@router.post("/cancel")
async def cancel() -> dict:
    from codegaai.core.updater import Updater
    ok = Updater.get().cancel_download()
    if ok: _add_history("download_cancelled")
    return {"cancelled": ok}


# ── Uygulama ─────────────────────────────────────────────────────────────

@router.post("/apply")
async def apply() -> dict:
    from codegaai.core.updater import Updater
    upd = Updater.get()
    d   = upd.status
    if d.get("state") != "completed":
        from fastapi import HTTPException
        raise HTTPException(409, f"İndirme tamamlanmamış: {d.get('state')}")
    _auto_backup_silent()
    try:
        result = upd.apply()
        _add_history("update_applied", d.get("version", ""))
        return {**result, "message": "Uygulama yeniden başlatılıyor…"}
    except Exception as e:
        _add_history("update_failed", d.get("version", ""), str(e))
        return {"error": str(e)}


# ── Yedek ────────────────────────────────────────────────────────────────

def _auto_backup_silent() -> None:
    if not _is_frozen(): return
    try:
        idir = _install_dir()
        if not idir: return
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        dest = BACKUP_DIR / f"auto_{time.strftime('%Y%m%d_%H%M%S')}.zip"
        with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in idir.rglob("*"):
                if f.is_file() and ".zip" not in f.name:
                    try: zf.write(f, f.relative_to(idir))
                    except Exception: pass
        # Max 3 yedek tut
        bk = sorted(BACKUP_DIR.glob("*.zip"), key=lambda x: x.stat().st_mtime)
        for old in bk[:-3]: old.unlink(missing_ok=True)
        _add_history("auto_backup", _cur_ver(), dest.name)
        log.info("Otomatik yedek: %s", dest.name)
    except Exception as e:
        log.warning("Yedek alınamadı: %s", e)


class BackupReq(BaseModel):
    label: str = ""

@router.post("/backup")
async def backup(req: BackupReq) -> dict:
    if not _is_frozen():
        return {"error": "Yedek sadece .exe modunda çalışır", "ok": False}
    idir = _install_dir()
    if not idir: return {"error": "Kurulum dizini yok", "ok": False}
    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        label = "".join(c for c in (req.label or time.strftime("%Y%m%d_%H%M%S")) if c.isalnum() or c in "-_")[:30]
        dest  = BACKUP_DIR / f"manual_{label}.zip"
        with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in idir.rglob("*"):
                if f.is_file() and ".zip" not in f.name:
                    try: zf.write(f, f.relative_to(idir))
                    except Exception: pass
        size = round(dest.stat().st_size / 1_048_576, 1)
        _add_history("manual_backup", _cur_ver(), dest.name)
        return {"ok": True, "file": dest.name, "size_mb": size}
    except Exception as e:
        return {"error": str(e), "ok": False}


@router.get("/backups")
async def backups() -> dict:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    result = []
    for f in sorted(BACKUP_DIR.glob("*.zip"), key=lambda x: x.stat().st_mtime, reverse=True):
        result.append({
            "name":     f.name,
            "size_mb":  round(f.stat().st_size / 1_048_576, 1),
            "created":  time.strftime("%Y-%m-%d %H:%M", time.localtime(f.stat().st_mtime)),
        })
    return {"backups": result, "count": len(result)}


# ── Rollback ─────────────────────────────────────────────────────────────

class RollbackReq(BaseModel):
    backup_name: str = ""

@router.post("/rollback")
async def rollback(req: RollbackReq) -> dict:
    if not _is_frozen():
        return {"error": "Rollback sadece .exe modunda çalışır"}
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    if req.backup_name:
        bk_path = BACKUP_DIR / req.backup_name
    else:
        bks = sorted(BACKUP_DIR.glob("*.zip"), key=lambda x: x.stat().st_mtime)
        if not bks: return {"error": "Yedek bulunamadı"}
        bk_path = bks[-1]
    if not bk_path.exists():
        return {"error": f"Bulunamadı: {bk_path.name}"}
    try:
        idir = _install_dir()
        bat  = DATA_DIR / "rollback_update.bat"
        bat.write_text(
            f"@echo off\r\ntimeout /t 3 /nobreak >nul\r\n"
            f"powershell -Command \"Expand-Archive -Force '{bk_path}' '{idir}'\"\r\n"
            f"start \"\" \"{idir}\\codegaai.exe\"\r\ndel \"%~f0\"\r\n",
            encoding="ascii"
        )
        import subprocess, os
        subprocess.Popen(["cmd.exe", "/c", str(bat)],
                         creationflags=0x00000008, close_fds=True)
        _add_history("rollback", bk_path.name)
        os.kill(os.getpid(), 15)
        return {"ok": True, "backup": bk_path.name, "message": "Rollback başlatıldı…"}
    except Exception as e:
        return {"error": str(e)}


# ── Otomatik Güncelleme ───────────────────────────────────────────────────

class AutoReq(BaseModel):
    enabled: bool
    check_interval_hours: int = 6

@router.post("/auto")
async def auto_update(req: AutoReq) -> dict:
    if req.enabled:
        AUTO_FLAG.parent.mkdir(parents=True, exist_ok=True)
        AUTO_FLAG.write_text(json.dumps({
            "interval_hours": req.check_interval_hours,
            "enabled_at": time.strftime("%Y-%m-%d %H:%M"),
        }), "utf-8")
        _launch_auto_checker(req.check_interval_hours)
        return {"auto_update": True, "interval_hours": req.check_interval_hours}
    else:
        AUTO_FLAG.unlink(missing_ok=True)
        return {"auto_update": False}


def _launch_auto_checker(hours: int = 6) -> None:
    def _loop():
        while AUTO_FLAG.exists():
            try:
                from codegaai.core.updater import Updater
                info = Updater.get().check_for_updates(force=True)
                if info.update_available:
                    PENDING_FILE.write_text(json.dumps({
                        "version":     info.latest_version,
                        "notes":       info.release_notes or "",
                        "detected_at": time.strftime("%H:%M"),
                    }), "utf-8")
                    log.info("Otomatik güncelleme tespit edildi: %s", info.latest_version)
            except Exception as e:
                log.debug("Oto-kontrol hatası: %s", e)
            time.sleep(hours * 3600)
    threading.Thread(target=_loop, daemon=True, name="auto-update").start()


@router.get("/pending")
async def pending() -> dict:
    if PENDING_FILE.exists():
        try: return {"pending": True, **json.loads(PENDING_FILE.read_text("utf-8"))}
        except Exception: pass
    return {"pending": False}

@router.post("/dismiss-pending")
async def dismiss_pending() -> dict:
    PENDING_FILE.unlink(missing_ok=True)
    return {"ok": True}


# ── Temizlik ve Diğerleri ─────────────────────────────────────────────────

@router.get("/install-dir")
async def install_dir() -> dict:
    idir = _install_dir()
    return {"frozen": _is_frozen(), "install_dir": str(idir) if idir else None}

@router.post("/cleanup")
async def cleanup() -> dict:
    from codegaai.core.updater import Updater
    upd = Updater.get()
    try:
        deleted = upd.cleanup_old_downloads() if hasattr(upd, "cleanup_old_downloads") else 0
    except Exception: deleted = 0
    return {"deleted_count": deleted, "ok": True}
