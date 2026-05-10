"""Sistem bilgisi ve sağlık kontrol uç noktaları."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from codegaai import __version__, __phase__
from codegaai.config import get_config
from codegaai.utils.system_check import run_all_checks

router = APIRouter()


@router.get("/info")
async def info() -> dict[str, Any]:
    cfg = get_config()
    return {
        "name": "CODEGA AI",
        "version": __version__,
        "phase": __phase__,
        "language": cfg["app"]["language"],
        "theme": cfg["app"]["theme"],
        "models": cfg["models"],
    }


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/check")
async def check() -> dict[str, Any]:
    report = run_all_checks()
    return {
        "overall": report.overall_status,
        "results": [
            {
                "name": r.name, "status": r.status,
                "message": r.message, "detail": r.detail,
            }
            for r in report.results
        ],
    }


@router.get("/engines")
async def engines() -> dict[str, Any]:
    """Tüm motorların gerçek durumu — her biri 2 sn timeout."""
    import asyncio

    loop = asyncio.get_event_loop()

    def _collect() -> dict:
        from codegaai.core.engine import LLMEngine
        from codegaai.core.embeddings import EmbeddingService

        llm = LLMEngine.get()
        emb = EmbeddingService.get()

        chromadb_ok = False
        try:
            import chromadb  # type: ignore
            chromadb_ok = True
        except ImportError:
            pass

        img_status: dict = {"state": "unloaded", "ready": False}
        try:
            from codegaai.core.image_engine import ImageEngine
            img_status = ImageEngine.get().status
        except Exception:
            pass

        tts_status: dict = {"state": "unloaded", "ready": False}
        asr_status: dict = {"state": "unloaded", "ready": False}
        try:
            from codegaai.core.audio_engine import TTSEngine, ASREngine
            tts_status = TTSEngine.get().status
            asr_status = ASREngine.get().status
        except Exception:
            pass

        video_status: dict = {"state": "unloaded", "ready": False}
        try:
            from codegaai.core.video_engine import VideoEngine
            video_status = VideoEngine.get().status
        except Exception:
            pass

        learning_active = False
        feedback_count = 0
        deps_ok = False
        try:
            from codegaai.core.learning import (
                FeedbackStore, TrainingEngine,
            )
            feedback_count = FeedbackStore.open().stats().get("total", 0)
            deps_ok = all(TrainingEngine.check_dependencies().values())
            learning_active = TrainingEngine.get().is_training
        except Exception:
            pass

        updater_status: dict = {"frozen_mode": False, "state": "idle"}
        try:
            from codegaai.core.updater import Updater
            upd = Updater.get()
            updater_status = {
                "frozen_mode": upd.is_frozen(),
                "state": upd.status.get("state", "idle"),
            }
        except Exception:
            pass

        llm_st = llm.status
        emb_st = emb.status

        return {
            "llm": {
                "active": llm.is_ready,
                "state": llm_st["state"],
                "model_id": llm_st.get("model_id"),
                "backend": llm_st.get("backend"),
                "error": llm_st.get("error"),
                "context_length": llm_st.get("context_length"),
                "phase": "Faz 3",
            },
            "embedding": {
                "active": emb.is_ready,
                "state": emb_st["state"],
                "model_id": emb_st.get("model_id"),
                "phase": "Faz 3",
            },
            "memory": {
                "active": chromadb_ok,
                "state": "ready" if chromadb_ok else "unloaded",
                "reason": ("ChromaDB hazır" if chromadb_ok
                           else "ChromaDB yüklü değil"),
                "phase": "Faz 3",
            },
            "image": {
                "active": img_status.get("ready", False),
                "state": img_status.get("state", "unloaded"),
                "model_id": img_status.get("model_id"),
                "phase": "Faz 4",
            },
            "audio": {
                "active": tts_status.get("ready", False) or asr_status.get("ready", False),
                "tts": tts_status,
                "asr": asr_status,
                "phase": "Faz 5",
            },
            "video": {
                "active": video_status.get("ready", False),
                "state": video_status.get("state", "unloaded"),
                "model_id": video_status.get("model_id"),
                "phase": "Faz 6",
            },
            "learning": {
                "active": learning_active or feedback_count > 0,
                "state": "training" if learning_active else "idle",
                "feedback_count": feedback_count,
                "training_deps_ok": deps_ok,
                "phase": "Faz 7",
            },
            "updater": {
                "active": updater_status.get("frozen_mode", False),
                "state": updater_status.get("state", "idle"),
                "frozen_mode": updater_status.get("frozen_mode", False),
                "phase": "Faz 8",
            },
        }

    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(None, _collect),
            timeout=4.0,
        )
        return result
    except asyncio.TimeoutError:
        # Timeout durumunda en azından LLM durumunu göster
        from codegaai.core.engine import LLMEngine
        llm = LLMEngine.get()
        return {
            "llm": {
                "active": llm.is_ready,
                "state": llm.status["state"],
                "model_id": llm.status.get("model_id"),
                "error": llm.status.get("error"),
                "phase": "Faz 3",
            },
            "_timeout": True,
        }


# ============================================================
# Disk ve Model Dizini Yönetimi
# ============================================================

@router.get("/disks")
async def list_disks() -> dict:
    """
    Kullanılabilir diskler + boş alan.
    Her disk için max 1.5 sn timeout — CD/ağ/floppy takılmasın.
    """
    import asyncio
    import shutil
    from codegaai.config import MODELS_DIR, DATA_DIR

    async def _safe_disk_usage(path: str) -> tuple | None:
        """Disk kullanımını 1.5 sn timeout ile al."""
        loop = asyncio.get_event_loop()
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(None, shutil.disk_usage, path),
                timeout=1.5,
            )
            return result
        except Exception:
            return None

    disks = []

    if __import__("sys").platform == "win32":
        try:
            import ctypes
            # GetLogicalDrives → bitmask
            bitmask = ctypes.windll.kernel32.GetLogicalDrives()
            for i, letter in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZ"):
                if not (bitmask >> i & 1):
                    continue

                path = f"{letter}:\\"

                # GetDriveType: 3=FIXED, 2=REMOVABLE — CD/network/unknown atla
                drive_type = ctypes.windll.kernel32.GetDriveTypeW(path)
                if drive_type not in (2, 3):   # 2=removable, 3=fixed
                    continue

                usage = await _safe_disk_usage(path)
                if usage is None:
                    continue

                total, used, free = usage
                if total == 0:
                    continue

                disks.append({
                    "path": path,
                    "label": letter,
                    "type": "fixed" if drive_type == 3 else "removable",
                    "total_gb": round(total / 1e9, 1),
                    "free_gb": round(free / 1e9, 1),
                    "used_pct": round(used / total * 100),
                })
        except Exception as exc:
            log.warning("Windows disk listesi hatası: %s", exc)
    else:
        for mount in ["/", str(__import__("pathlib").Path.home())]:
            usage = await _safe_disk_usage(mount)
            if usage:
                total, used, free = usage
                disks.append({
                    "path": mount,
                    "label": mount,
                    "type": "fixed",
                    "total_gb": round(total / 1e9, 1),
                    "free_gb": round(free / 1e9, 1),
                    "used_pct": round(used / total * 100),
                })

    return {
        "disks": disks,
        "current_models_dir": str(MODELS_DIR),
        "current_data_dir": str(DATA_DIR),
    }


@router.post("/models-dir")
async def set_models_dir(body: dict) -> dict:
    """
    Model indirme dizinini değiştir.
    body: {"path": "D:\\CODEGA_Models"}
    Yeniden başlatma gerektirir.
    """
    import json
    from codegaai.config import DATA_DIR

    new_path = body.get("path", "").strip()
    if not new_path:
        return {"error": "path boş olamaz"}

    from pathlib import Path
    try:
        p = Path(new_path).expanduser().resolve()
        p.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        return {"error": f"Dizin oluşturulamadı: {exc}"}

    # Config dosyasına yaz
    cfg_file = DATA_DIR / "codegaai_config.json"
    cfg = {}
    if cfg_file.exists():
        try:
            cfg = json.loads(cfg_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    cfg["models_dir"] = str(p)
    cfg_file.write_text(json.dumps(cfg, ensure_ascii=False, indent=2),
                        encoding="utf-8")

    return {
        "ok": True,
        "new_path": str(p),
        "message": "Değişiklik uygulandı. Model indirme işlemleri bu dizini kullanacak.",
        "restart_needed": False,  # Runtime'da da geçerli
    }


@router.get("/models-dir")
async def get_models_dir() -> dict:
    from codegaai.config import MODELS_DIR
    import shutil
    try:
        total, used, free = shutil.disk_usage(str(MODELS_DIR.anchor))
        disk_free_gb = round(free / 1e9, 1)
    except Exception:
        disk_free_gb = 0

    # Mevcut model boyutları
    model_size_gb = 0.0
    try:
        model_size_gb = sum(
            f.stat().st_size for f in MODELS_DIR.rglob("*") if f.is_file()
        ) / 1e9
    except Exception:
        pass

    return {
        "models_dir": str(MODELS_DIR),
        "model_size_gb": round(model_size_gb, 2),
        "disk_free_gb": disk_free_gb,
    }
