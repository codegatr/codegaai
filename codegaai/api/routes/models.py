"""
Model yönetimi uç noktaları (Faz 3).

GET  /api/models                     — tüm modellerin durumu
GET  /api/models/llm                 — LLM kataloğu
GET  /api/models/embedding           — embedding kataloğu
GET  /api/models/{id}/status         — indirme/yükleme durumu
POST /api/models/{id}/download       — indirmeyi başlat (arkaplan)
POST /api/models/{id}/cancel         — indirmeyi iptal et
POST /api/models/{id}/load           — belleğe yükle
POST /api/models/{id}/unload         — bellekten çıkar
DELETE /api/models/{id}              — diskten sil
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from codegaai.core.engine import LLMEngine
from codegaai.core.embeddings import EmbeddingService
from codegaai.core.models_registry import ModelRegistry

router = APIRouter()


def _enrich_llm(model: dict[str, Any], registry: ModelRegistry,
                engine_status: dict[str, Any]) -> dict[str, Any]:
    """LLM model bilgisine indirme/yükleme durumunu ekle."""
    model_id = model["id"]
    progress = registry.get_progress(model_id)
    return {
        **model,
        "downloaded": registry.is_llm_downloaded(model_id),
        "loaded": (engine_status.get("model_id") == model_id
                   and engine_status.get("ready", False)),
        "download": progress.to_dict(),
    }


@router.get("")
async def list_all_models() -> dict[str, Any]:
    """Tüm modeller (LLM + embedding) — durumlarıyla birlikte."""
    registry = ModelRegistry.get()
    engine = LLMEngine.get()
    embedding = EmbeddingService.get()

    engine_status = engine.status

    llm_models = [
        _enrich_llm(m, registry, engine_status)
        for m in registry.list_llm_models()
    ]
    emb_models = [
        {
            **m,
            "downloaded": registry.is_embedding_downloaded(m["id"]),
            "loaded": (embedding.status.get("model_id") == m["id"]
                       and embedding.status.get("ready", False)),
        }
        for m in registry.list_embedding_models()
    ]
    return {
        "llm": llm_models,
        "embedding": emb_models,
        "disk_usage": registry.disk_usage(),
        "engines": {
            "llm": engine_status,
            "embedding": embedding.status,
        },
    }


@router.get("/llm")
async def list_llm() -> dict[str, Any]:
    registry = ModelRegistry.get()
    engine = LLMEngine.get()
    return {
        "models": [
            _enrich_llm(m, registry, engine.status)
            for m in registry.list_llm_models()
        ],
    }


@router.get("/embedding")
async def list_embedding() -> dict[str, Any]:
    registry = ModelRegistry.get()
    embedding = EmbeddingService.get()
    return {
        "models": [
            {
                **m,
                "downloaded": registry.is_embedding_downloaded(m["id"]),
                "loaded": (embedding.status.get("model_id") == m["id"]
                           and embedding.status.get("ready", False)),
            }
            for m in registry.list_embedding_models()
        ],
    }


@router.get("/{model_id}/status")
async def get_status(model_id: str) -> dict[str, Any]:
    registry = ModelRegistry.get()
    spec = registry.get_llm_spec(model_id) or registry.get_embedding_spec(model_id)
    if not spec:
        raise HTTPException(404, f"Model bulunamadı: {model_id}")

    engine = LLMEngine.get()
    progress = registry.get_progress(model_id)

    return {
        "model_id": model_id,
        "downloaded": (registry.is_llm_downloaded(model_id)
                       if registry.get_llm_spec(model_id)
                       else registry.is_embedding_downloaded(model_id)),
        "loaded": engine.status.get("model_id") == model_id and engine.is_ready,
        "download": progress.to_dict(),
        "engine": engine.status if registry.get_llm_spec(model_id) else None,
    }


@router.post("/{model_id}/download")
async def start_download(model_id: str) -> dict[str, Any]:
    registry = ModelRegistry.get()
    spec = registry.get_llm_spec(model_id)
    if not spec:
        # Embedding modelleri sentence-transformers'la otomatik iniyor;
        # ayrı bir indirme akışı yok.
        if registry.get_embedding_spec(model_id):
            return {
                "status": "auto",
                "message": (f"{model_id} ilk yüklemede sentence-transformers "
                            f"tarafından otomatik indirilir. Doğrudan /load çağırın."),
            }
        raise HTTPException(404, f"LLM modeli bulunamadı: {model_id}")

    if registry.is_llm_downloaded(model_id):
        return {
            "status": "already_downloaded",
            "model_id": model_id,
            "progress": registry.get_progress(model_id).to_dict(),
        }

    registry.download_llm_async(model_id)
    return {
        "status": "started",
        "model_id": model_id,
        "progress": registry.get_progress(model_id).to_dict(),
    }


@router.post("/{model_id}/cancel")
async def cancel_download(model_id: str) -> dict[str, Any]:
    registry = ModelRegistry.get()
    cancelled = registry.cancel_download(model_id)
    return {"cancelled": cancelled, "model_id": model_id}


@router.post("/{model_id}/load")
async def load_model(model_id: str,
                     n_ctx: int = 8192,
                     n_gpu_layers: int = -1) -> dict[str, Any]:
    """LLM veya embedding modelini belleğe yükle."""
    registry = ModelRegistry.get()

    if registry.get_llm_spec(model_id):
        engine = LLMEngine.get()
        try:
            engine.load(model_id, n_ctx=n_ctx, n_gpu_layers=n_gpu_layers)
        except RuntimeError as exc:
            raise HTTPException(409, str(exc))
        except Exception as exc:
            raise HTTPException(500, f"Yükleme başarısız: {exc}")
        return {"loaded": True, "engine": engine.status}

    if registry.get_embedding_spec(model_id):
        svc = EmbeddingService.get()
        try:
            svc.load(model_id)
        except Exception as exc:
            raise HTTPException(500, f"Embedding yükleme başarısız: {exc}")
        return {"loaded": True, "embedding": svc.status}

    raise HTTPException(404, f"Model bulunamadı: {model_id}")


@router.post("/{model_id}/unload")
async def unload_model(model_id: str) -> dict[str, Any]:
    registry = ModelRegistry.get()

    if registry.get_llm_spec(model_id):
        engine = LLMEngine.get()
        if engine.status.get("model_id") == model_id:
            engine.unload()
        return {"unloaded": True}

    if registry.get_embedding_spec(model_id):
        svc = EmbeddingService.get()
        if svc.status.get("model_id") == model_id:
            svc.unload()
        return {"unloaded": True}

    raise HTTPException(404, f"Model bulunamadı: {model_id}")


@router.delete("/{model_id}")
async def delete_model(model_id: str) -> dict[str, Any]:
    """Modeli diskten sil. Yüklüyse önce boşaltılır."""
    registry = ModelRegistry.get()

    if registry.get_llm_spec(model_id):
        engine = LLMEngine.get()
        if engine.status.get("model_id") == model_id:
            engine.unload()
        return {"deleted": registry.delete_llm(model_id)}

    if registry.get_embedding_spec(model_id):
        svc = EmbeddingService.get()
        if svc.status.get("model_id") == model_id:
            svc.unload()
        return {"deleted": registry.delete_embedding(model_id)}

    raise HTTPException(404, f"Model bulunamadı: {model_id}")
