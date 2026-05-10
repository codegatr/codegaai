"""
codegaai.api.routes.setup
===========================

İlk Kurulum Sihirbazı uç noktaları.

GET  /api/setup/status   — kurulum tamamlandı mı?
GET  /api/setup/disks    — kullanılabilir diskler (async + timeout)
POST /api/setup/complete — {models_dir, data_dir?} → config yaz
POST /api/setup/reset    — kurulumu sıfırla (tekrar sihirbaz göster)
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
    from codegaai.config import DATA_DIR, MODELS_DIR
    return {
        "done": is_setup_done(),
        "data_dir": str(DATA_DIR),
        "models_dir": str(MODELS_DIR),
    }


# ============================================================
# Diskler (async + timeout — CD/floppy takılmasın)
# ============================================================

@router.get("/disks")
async def setup_disks() -> dict:
    """Kurulum sırasında disk listesi — her disk 1.5 sn timeout."""
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
                # Sadece FIXED(3) ve REMOVABLE(2)
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
                    "recommended": free > 10e9,  # 10 GB+ boş → önerilen
                })
        except Exception as exc:
            log.warning("Disk listesi hatası: %s", exc)
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
    install_dir: str = ""  # İleride kullanım için


@router.post("/complete")
async def complete_setup(req: SetupCompleteRequest) -> dict:
    """
    Kurulum dizinini kaydet ve kurulumu tamamlandı olarak işaretle.
    """
    from codegaai.config import DATA_DIR

    # Models dizinini oluştur
    models_path = Path(req.models_dir).expanduser().resolve()
    try:
        models_path.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        return {"ok": False, "error": f"Dizin oluşturulamadı: {exc}"}

    # Config'e yaz
    cfg_file = DATA_DIR / "codegaai_config.json"
    cfg: dict = {}
    if cfg_file.exists():
        try:
            cfg = json.loads(cfg_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    cfg["models_dir"] = str(models_path)
    cfg["setup_version"] = "1.0"
    cfg_file.write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # Setup tamamlandı bayrağı
    flag = _setup_flag_path()
    flag.write_text(
        json.dumps({
            "completed_at": __import__("time").time(),
            "models_dir": str(models_path),
        }),
        encoding="utf-8",
    )

    log.info("Kurulum tamamlandı: models_dir=%s", models_path)
    return {
        "ok": True,
        "models_dir": str(models_path),
        "message": "Kurulum tamamlandı. CODEGA AI hazır!",
    }


@router.post("/reset")
async def reset_setup() -> dict:
    """Kurulumu sıfırla — sihirbaz tekrar gösterilir."""
    flag = _setup_flag_path()
    if flag.exists():
        flag.unlink()
    return {"ok": True, "message": "Kurulum sıfırlandı"}
