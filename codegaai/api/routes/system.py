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
    """Tüm motorların gerçek durumu."""
    from codegaai.core.engine import LLMEngine
    from codegaai.core.embeddings import EmbeddingService

    llm = LLMEngine.get()
    emb = EmbeddingService.get()

    # ChromaDB hazır mı?
    chromadb_ok = False
    try:
        import chromadb  # type: ignore[import-not-found]
        chromadb_ok = True
    except ImportError:
        pass

    # Image motor (Faz 4)
    img_status = {"state": "unloaded", "ready": False}
    try:
        from codegaai.core.image_engine import ImageEngine
        img = ImageEngine.get()
        img_status = img.status
    except Exception:
        pass

    # Audio motorları (Faz 5)
    tts_status = {"state": "unloaded", "ready": False}
    asr_status = {"state": "unloaded", "ready": False}
    try:
        from codegaai.core.audio_engine import TTSEngine, ASREngine
        tts_status = TTSEngine.get().status
        asr_status = ASREngine.get().status
    except Exception:
        pass

    # Video motoru (Faz 6)
    video_status = {"state": "unloaded", "ready": False}
    try:
        from codegaai.core.video_engine import VideoEngine
        video_status = VideoEngine.get().status
    except Exception:
        pass

    # Self-Learning (Faz 7)
    learning_active = False
    feedback_count = 0
    deps_ok = False
    try:
        from codegaai.core.learning import (
            FeedbackStore, TrainingEngine, AdapterManager,
        )
        feedback_count = FeedbackStore.open().stats().get("total", 0)
        deps_ok = all(TrainingEngine.check_dependencies().values())
        learning_active = TrainingEngine.get().is_training
    except Exception:
        pass

    # Updater (Faz 8)
    updater_status = {"frozen_mode": False, "state": "idle"}
    try:
        from codegaai.core.updater import Updater
        upd = Updater.get()
        updater_status = {
            "frozen_mode": upd.is_frozen(),
            "state": upd.status.get("state", "idle"),
        }
    except Exception:
        pass

    return {
        "llm": {
            "active": llm.is_ready,
            "state": llm.status["state"],
            "model_id": llm.status.get("model_id"),
            "backend": llm.status.get("backend"),
            "phase": "Faz 3",
        },
        "embedding": {
            "active": emb.is_ready,
            "state": emb.status["state"],
            "model_id": emb.status.get("model_id"),
            "phase": "Faz 3",
        },
        "memory": {
            "active": chromadb_ok,
            "state": "ready" if chromadb_ok else "unloaded",
            "reason": ("ChromaDB hazır" if chromadb_ok
                       else "ChromaDB yüklü değil — pip install chromadb"),
            "phase": "Faz 3",
        },
        "image": {
            "active": img_status.get("ready", False),
            "state": img_status.get("state", "unloaded"),
            "model_id": img_status.get("model_id"),
            "backend": img_status.get("backend"),
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
            "backend": video_status.get("backend"),
            "pipeline": video_status.get("pipeline"),
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


# ============================================================
# Disk ve Model Dizini Yönetimi
# ============================================================

@router.get("/disks")
async def list_disks() -> dict:
    """
    Kullanılabilir diskler + boş alan.
    Windows'ta C:, D:, E: vb. — Linux'ta mount noktaları.
    """
    import shutil
    disks = []

    if __import__("sys").platform == "win32":
        # Windows: tüm logical sürücüler
        try:
            import ctypes
            bitmask = ctypes.windll.kernel32.GetLogicalDrives()
            for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
                if bitmask & 1:
                    path = f"{letter}:\\"
                    try:
                        total, used, free = shutil.disk_usage(path)
                        disks.append({
                            "path": path,
                            "label": letter,
                            "total_gb": round(total / 1e9, 1),
                            "free_gb": round(free / 1e9, 1),
                            "used_pct": round(used / total * 100),
                        })
                    except Exception:
                        pass
                bitmask >>= 1
        except Exception:
            # Fallback: sadece C
            try:
                total, used, free = shutil.disk_usage("C:\\")
                disks.append({"path": "C:\\", "label": "C",
                              "total_gb": round(total/1e9,1),
                              "free_gb": round(free/1e9,1),
                              "used_pct": round(used/total*100)})
            except Exception:
                pass
    else:
        # Linux/macOS: /home ve /
        for mount in ["/", str(__import__("pathlib").Path.home())]:
            try:
                total, used, free = shutil.disk_usage(mount)
                disks.append({
                    "path": mount,
                    "label": mount,
                    "total_gb": round(total / 1e9, 1),
                    "free_gb": round(free / 1e9, 1),
                    "used_pct": round(used / total * 100),
                })
            except Exception:
                pass

    from codegaai.config import MODELS_DIR, DATA_DIR
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
