"""
Self-Learning uç noktaları (Faz 7).

POST /api/learning/feedback           — bir mesaja 👍/👎 ver
DELETE /api/learning/feedback/{...}   — feedback'i geri al
GET  /api/learning/feedback           — son feedback'ler
GET  /api/learning/stats              — feedback istatistikleri
GET  /api/learning/dataset            — DPO tercih çiftleri preview
GET  /api/learning/adapters           — LoRA adapter listesi
POST /api/learning/adapters/activate  — adapter aktif et (hot-swap)
DELETE /api/learning/adapters/{id}    — adapter sil
POST /api/learning/train              — DPO eğitimi başlat
GET  /api/learning/status             — eğitim durumu
POST /api/learning/cancel             — eğitimi iptal et
GET  /api/learning/dependencies       — peft/trl/bnb yüklü mü?
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from codegaai.core.learning import (
    AdapterManager,
    FeedbackStore,
    TrainingEngine,
)
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


# ============================================================
# Feedback
# ============================================================

class FeedbackRequest(BaseModel):
    chat_id: int = Field(..., ge=1)
    message_id: int = Field(..., ge=1)
    rating: int = Field(..., description="-1 begenmeme, +1 begeni")
    note: str = Field("", max_length=1000)
    user_message: str = Field("", max_length=10000)
    assistant_message: str = Field(..., min_length=1, max_length=20000)
    model_id: Optional[str] = None


@router.post("/feedback")
async def add_feedback(req: FeedbackRequest) -> dict:
    if req.rating not in (-1, 1):
        raise HTTPException(400, "rating sadece -1 veya +1 olabilir")
    store = FeedbackStore.open()
    fb_id = store.add(
        chat_id=req.chat_id, message_id=req.message_id,
        rating=req.rating, note=req.note,
        user_message=req.user_message,
        assistant_message=req.assistant_message,
        model_id=req.model_id,
    )
    return {"id": fb_id, "stored": True}


@router.delete("/feedback/{chat_id}/{message_id}")
async def remove_feedback(chat_id: int, message_id: int) -> dict:
    store = FeedbackStore.open()
    ok = store.remove(chat_id, message_id)
    return {"removed": ok}


@router.get("/feedback")
async def list_feedback(limit: int = 50,
                         rating: Optional[int] = None) -> dict:
    store = FeedbackStore.open()
    items = store.list_recent(limit=limit, rating=rating)
    return {
        "feedback": [
            {
                "id": f.id,
                "chat_id": f.chat_id,
                "message_id": f.message_id,
                "rating": f.rating,
                "note": f.note,
                "assistant_message": f.assistant_message[:300],  # trim
                "model_id": f.model_id,
                "created_at": f.created_at,
            }
            for f in items
        ],
    }


@router.get("/stats")
async def stats() -> dict:
    store = FeedbackStore.open()
    return store.stats()


@router.get("/dataset")
async def dataset(min_pairs: int = 4) -> dict:
    """DPO tercih çiftleri önizleme."""
    store = FeedbackStore.open()
    return store.export_dpo_dataset(min_pairs=min_pairs)


# ============================================================
# Adapters
# ============================================================

@router.get("/adapters")
async def list_adapters() -> dict:
    mgr = AdapterManager.get()
    items = mgr.list()
    return {
        "active_id": mgr.active_id,
        "adapters": [
            {
                "id": a.id, "name": a.name,
                "base_model": a.base_model,
                "size_mb": a.size_mb,
                "active": a.active,
                "description": a.description,
                "created_at": a.created_at,
            }
            for a in items
        ],
    }


class ActivateRequest(BaseModel):
    adapter_id: Optional[str] = None  # None = devre dışı


@router.post("/adapters/activate")
async def activate_adapter(req: ActivateRequest) -> dict:
    mgr = AdapterManager.get()
    try:
        mgr.activate(req.adapter_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    return {"active_id": mgr.active_id, "note": (
        "Adapter etkili olması için modeli yeniden yüklemeniz gerekebilir "
        "(/api/models/<id>/unload sonrası /load)."
    )}


@router.delete("/adapters/{adapter_id}")
async def delete_adapter(adapter_id: str) -> dict:
    mgr = AdapterManager.get()
    ok = mgr.delete(adapter_id)
    if not ok:
        raise HTTPException(404, "Adapter bulunamadı")
    return {"deleted": True}


# ============================================================
# Training
# ============================================================

class TrainRequest(BaseModel):
    base_model_id: str = Field(..., min_length=1)
    adapter_name: str = Field(..., min_length=1, max_length=100)
    epochs: int = Field(1, ge=1, le=10)
    learning_rate: float = Field(5e-5, ge=1e-7, le=1e-3)


@router.post("/train")
async def start_training(req: TrainRequest) -> dict:
    eng = TrainingEngine.get()
    store = FeedbackStore.open()

    dataset_info = store.export_dpo_dataset(min_pairs=4)
    if not dataset_info["ready_for_training"]:
        raise HTTPException(
            409,
            f"Yeterli tercih çifti yok ({dataset_info['pair_count']} mevcut, "
            f"{dataset_info['min_required']} gerekli). Daha fazla 👍/👎 topla."
        )

    try:
        job_id = eng.start_dpo(
            base_model_id=req.base_model_id,
            pairs=dataset_info["pairs"],
            adapter_name=req.adapter_name,
            epochs=req.epochs,
            learning_rate=req.learning_rate,
        )
        return {"job_id": job_id, "pairs": dataset_info["pair_count"]}
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))


@router.post("/cancel")
async def cancel_training() -> dict:
    eng = TrainingEngine.get()
    return {"cancelled": eng.cancel()}


@router.get("/status")
async def training_status() -> dict:
    eng = TrainingEngine.get()
    return {**eng.status, "phase": "Faz 7"}


@router.get("/dependencies")
async def dependencies() -> dict:
    eng = TrainingEngine.get()
    deps = eng.check_dependencies()
    return {
        "dependencies": deps,
        "ready": all(deps.values()),
        "missing": [k for k, v in deps.items() if not v],
        "install_command": "pip install peft trl bitsandbytes datasets",
    }
