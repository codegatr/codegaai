"""
codegaai.api.routes.setup
===========================

Ilk Kurulum Sihirbazi uc noktalari.

GET  /api/setup/status   - kurulum tamamlandi mi?
GET  /api/setup/disks    - kullanilabilir diskler (async + timeout)
POST /api/setup/complete - {app_dir?, models_dir, data_dir?} -> config yaz
POST /api/setup/reset    - kurulumu sifirla (tekrar sihirbaz goster)
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


def _setup_flag_path() -> Path:
    from codegaai.config import DATA_DIR
    return DATA_DIR / "setup_complete"


def is_setup_done() -> bool:
    return _setup_flag_path().exists()


# ============================================================
# Status
# ============================================================

@router.get("/status")
async def setup_status() -> dict:
    from codegaai.config import DATA_DIR, MODELS_DIR, get_paths
    paths = get_paths()
    return {
        "done": is_setup_done(),
        "app_dir": str(paths.get("data", DATA_DIR)),
        "data_dir": str(paths.get("data", DATA_DIR)),
        "models_dir": str(MODELS_DIR),
    }


# ============================================================
# Diskler (async + timeout - CD/floppy takilmasin)
# ============================================================

@router.get("/disks")
async def setup_disks() -> dict:
    """Kurulum sirasinda disk listesi - her disk 1.5 sn timeout."""
    import shutil

    async def _disk_usage(path: str):
        loop = asyncio.get_event_loop()
        try:
            return await asyncio.wait_for(
                loop.run_in_executor(None, shutil.disk_usage, path),
                timeout=1.5,
            )
        except Exception:
            return None

    disks = []

    if sys.platform == "win32":
        try:
            import ctypes
            bitmask = ctypes.windll.kernel32.GetLogicalDrives()
            for i, letter in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZ"):
                if not (bitmask >> i & 1):
                    continue
                path = f"{letter}:\\"
                dtype = ctypes.windll.kernel32.GetDriveTypeW(path)
                if dtype not in (2, 3):
                    continue
                usage = await _disk_usage(path)
                if not usage or usage[0] == 0:
                    continue
                total, used, free = usage
                disks.append({
                    "path": path,
                    "label": letter,
                    "type": "fixed" if dtype == 3 else "removable",
                    "total_gb": round(total / 1e9, 1),
                    "free_gb": round(free / 1e9, 1),
                    "used_pct": round(used / total * 100),
                    "recommended": free > 10e9,
                })
        except Exception as exc:
            log.warning("Disk listesi hatasi: %s", exc)
    else:
        import shutil
        for mount in ["/", str(Path.home())]:
            usage = await _disk_usage(mount)
            if usage:
                total, used, free = usage
                disks.append({
                    "path": mount, "label": mount, "type": "fixed",
                    "total_gb": round(total / 1e9, 1),
                    "free_gb": round(free / 1e9, 1),
                    "used_pct": round(used / total * 100),
                    "recommended": free > 10e9,
                })

    return {"disks": disks}


# ============================================================
# Kurulumu Tamamla
# ============================================================

class SetupCompleteRequest(BaseModel):
    models_dir: str
    app_dir: str = ""
    data_dir: str = ""
    install_dir: str = ""
    download_default: bool = True


@router.post("/complete")
async def complete_setup(req: SetupCompleteRequest) -> dict:
    """
    Uygulama/veri ve model dizinlerini kaydet, kurulumu tamamlandi olarak isaretle.
    Onerilen model otomatik indirilmeye baslar.
    """
    from codegaai.config import DATA_DIR

    models_path = Path(req.models_dir).expanduser().resolve()
    app_root_raw = req.app_dir or req.install_dir
    app_path = (
        Path(app_root_raw).expanduser().resolve()
        if app_root_raw else models_path.parent / "CODEGA_App"
    )
    data_path = (
        Path(req.data_dir).expanduser().resolve()
        if req.data_dir else app_path / "data"
    )
    try:
        app_path.mkdir(parents=True, exist_ok=True)
        data_path.mkdir(parents=True, exist_ok=True)
        for sub in ("memory", "outputs", "logs", "cache", "temp"):
            (data_path / sub).mkdir(parents=True, exist_ok=True)
        models_path.mkdir(parents=True, exist_ok=True)
        for sub in ("llm", "embedding", "image", "audio", "video"):
            (models_path / sub).mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        return {"ok": False, "error": f"Dizin olusturulamadi: {exc}"}

    cfg_file = DATA_DIR / "codegaai_config.json"
    cfg: dict = {}
    if cfg_file.exists():
        try:
            cfg = json.loads(cfg_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    cfg["models_dir"] = str(models_path)
    cfg["app_dir"] = str(app_path)
    cfg["install_dir"] = str(app_path)
    cfg["data_dir"] = str(data_path)
    cfg["setup_version"] = "2.0"
    cfg["platform"] = sys.platform
    cfg_file.write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    flag = _setup_flag_path()
    flag.write_text(
        json.dumps({
            "completed_at": __import__("time").time(),
            "app_dir": str(app_path),
            "data_dir": str(data_path),
            "models_dir": str(models_path),
        }),
        encoding="utf-8",
    )

    try:
        from codegaai.core.models_registry import ModelRegistry
        ModelRegistry._instance = None
    except Exception:
        pass

    log.info("Kurulum tamamlandi: app_dir=%s data_dir=%s models_dir=%s",
             app_path, data_path, models_path)

    if req.download_default:
        import threading
        def _download_default():
            import time as _time
            _time.sleep(1)
            try:
                from codegaai.core.models_registry import ModelRegistry
                reg = ModelRegistry.get()
                defaults = [m for m in reg.list_llm_models() if m.get("default")]
                if defaults:
                    model_id = defaults[0]["id"]
                    log.info("Onerilen model indiriliyor: %s", model_id)
                    reg.download_llm_async(model_id)
            except Exception as e:
                log.warning("Otomatik model indirme baslatilamadi: %s", e)
        threading.Thread(target=_download_default, daemon=True, name="setup-download").start()

    return {
        "ok": True,
        "app_dir": str(app_path),
        "data_dir": str(data_path),
        "models_dir": str(models_path),
        "message": "Kurulum tamamlandi!",
        "downloading": req.download_default,
    }


@router.post("/reset")
async def reset_setup() -> dict:
    """Kurulumu sifirla - sihirbaz tekrar gosterilir."""
    flag = _setup_flag_path()
    if flag.exists():
        flag.unlink()
    return {"ok": True, "message": "Kurulum sifirlandi"}
