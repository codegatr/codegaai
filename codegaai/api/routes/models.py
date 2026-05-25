"""
Model yönetimi uç noktaları (Faz 3).

GET  /api/models                     — tüm modellerin durumu
GET  /api/models/llm                 — LLM kataloğu
GET  /api/models/embedding           — embedding kataloğu
POST /api/models/recommended/warmup  — önerilen modeli arka planda hazırla
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


def _llm_load_error_response(engine: LLMEngine, exc: BaseException) -> HTTPException:
    """Turn low-level llama crashes into actionable user guidance."""
    status_error = engine.status.get("error")
    err = str(exc)
    err_lower = err.lower()
    if (
        "0xc000001d" in err_lower
        or "-1073741795" in err
        or "illegal instruction" in err_lower
        or (status_error and ("AVX2" in status_error or "Otomatik Onar" in status_error))
    ):
        return HTTPException(
            409,
            status_error or (
                "Bu Windows paketi CPU'nuzla uyumsuz bir llama.cpp çalışma zamanı "
                "yükledi. Sistem > Otomatik Onar ile AVX'siz derlemeyi kurun veya "
                "son AVX'siz Windows sürümünü indirin."
            ),
        )
    return HTTPException(500, f"Yükleme başarısız: {exc}")


def _enrich_llm(model: dict[str, Any], registry: ModelRegistry,
                engine_status: dict[str, Any]) -> dict[str, Any]:
    """LLM model bilgisine indirme/yükleme durumunu ekle."""
    model_id = model["id"]
    progress = registry.get_progress(model_id)
    load_error = ""
    if (engine_status.get("model_id") == model_id
            and engine_status.get("state") == "error"):
        load_error = engine_status.get("error", "") or "Model yuklenemedi."
    return {
        **model,
        "downloaded": registry.is_llm_downloaded(model_id),
        "loaded": (engine_status.get("model_id") == model_id
                   and engine_status.get("ready", False)),
        "load_error": load_error,
        "download": progress.to_dict(),
    }


@router.get("")
async def list_all_models() -> dict[str, Any]:
    """Tüm modeller — async, 6 sn timeout."""
    import asyncio
    loop = asyncio.get_event_loop()

    def _collect():
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
                "download": registry.get_progress(m["id"]).to_dict(),
            }
            for m in registry.list_embedding_models()
        ]

        img_status = {"state": "unloaded", "ready": False}
        try:
            from codegaai.core.image_engine import ImageEngine
            img_status = ImageEngine.get().status
        except Exception:
            pass

        image_models = [
            {
                **m,
                "downloaded": registry.is_image_downloaded(m["id"]),
                "loaded": (img_status.get("model_id") == m["id"]
                           and img_status.get("ready", False)),
                "download": registry.get_progress(m["id"]).to_dict(),
            }
            for m in registry.list_image_models()
        ]

        tts_status = {"state": "unloaded", "ready": False}
        asr_status = {"state": "unloaded", "ready": False}
        try:
            from codegaai.core.audio_engine import TTSEngine, ASREngine
            tts_status = TTSEngine.get().status
            asr_status = ASREngine.get().status
        except Exception:
            pass

        audio_models = [
            {
                **m,
                "downloaded": registry.is_audio_downloaded(m["id"]),
                "loaded": (
                    (m["kind"] == "tts" and tts_status.get("model_id") == m["id"]
                     and tts_status.get("ready", False)) or
                    (m["kind"] == "asr" and asr_status.get("model_id") == m["id"]
                     and asr_status.get("ready", False))
                ),
                "download": registry.get_progress(m["id"]).to_dict(),
            }
            for m in registry.list_audio_models()
        ]

        video_status = {"state": "unloaded", "ready": False}
        try:
            from codegaai.core.video_engine import VideoEngine
            video_status = VideoEngine.get().status
        except Exception:
            pass

        video_models = [
            {
                **m,
                "downloaded": registry.is_video_downloaded(m["id"]),
                "loaded": (video_status.get("model_id") == m["id"]
                           and video_status.get("ready", False)),
                "download": registry.get_progress(m["id"]).to_dict(),
            }
            for m in registry.list_video_models()
        ]

        return {
            "llm": llm_models,
            "embedding": emb_models,
            "image": image_models,
            "audio": audio_models,
            "video": video_models,
            "disk_usage": registry.disk_usage(),
            "engines": {
                "llm": engine_status,
                "embedding": embedding.status,
                "image": img_status,
                "tts": tts_status,
                "asr": asr_status,
                "video": video_status,
            },
        }

    try:
        return await asyncio.wait_for(
            loop.run_in_executor(None, _collect),
            timeout=6.0,
        )
    except asyncio.TimeoutError:
        # En azından LLM listesini döndür
        registry = ModelRegistry.get()
        engine = LLMEngine.get()
        return {
            "llm": [_enrich_llm(m, registry, engine.status)
                    for m in registry.list_llm_models()],
            "embedding": [], "image": [], "audio": [], "video": [],
            "disk_usage": {}, "engines": {}, "_timeout": True,
        }


@router.get("/llm")
async def list_llm() -> dict[str, Any]:
    import asyncio
    loop = asyncio.get_event_loop()

    def _get():
        registry = ModelRegistry.get()
        engine = LLMEngine.get()
        return {
            "models": [
                _enrich_llm(m, registry, engine.status)
                for m in registry.list_llm_models()
            ],
        }

    try:
        return await asyncio.wait_for(
            loop.run_in_executor(None, _get), timeout=5.0
        )
    except asyncio.TimeoutError:
        return {"models": [], "_timeout": True}


@router.get("/embedding")
async def list_embedding() -> dict[str, Any]:
    import asyncio
    loop = asyncio.get_event_loop()

    def _get():
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

    try:
        return await asyncio.wait_for(
            loop.run_in_executor(None, _get), timeout=5.0
        )
    except asyncio.TimeoutError:
        return {"models": [], "_timeout": True}


@router.get("/recommended")
async def recommended_model() -> dict[str, Any]:
    registry = ModelRegistry.get()
    from codegaai.core.device_model_policy import detect_device_profile, recommend_llm_model

    profile = detect_device_profile()
    downloaded_ids = {
        m["id"] for m in registry.list_llm_models()
        if registry.is_llm_downloaded(m["id"])
    }
    rec = recommend_llm_model(profile, downloaded_ids)
    spec = registry.get_llm_spec(rec.model_id)

    return {
        "profile": profile.__dict__,
        "recommendation": rec.__dict__,
        "downloaded": rec.model_id in downloaded_ids,
        "model": spec.__dict__ if spec else None,
    }


@router.post("/recommended/warmup")
async def warmup_recommended_model() -> dict[str, Any]:
    """Önerilen LLM'i arka planda hazırla; HTTP yanıtını bekletme."""
    registry = ModelRegistry.get()
    from codegaai.core.device_model_policy import detect_device_profile, recommend_llm_model
    from codegaai.core.model_warmup import warm_model_async

    profile = detect_device_profile()
    downloaded_ids = {
        m["id"] for m in registry.list_llm_models()
        if registry.is_llm_downloaded(m["id"])
    }
    rec = recommend_llm_model(profile, downloaded_ids)
    spec = registry.get_llm_spec(rec.model_id)
    if rec.model_id not in downloaded_ids:
        return {
            "status": "not_downloaded",
            "model_id": rec.model_id,
            "profile": profile.__dict__,
            "recommendation": rec.__dict__,
            "model": spec.__dict__ if spec else None,
        }

    warm = warm_model_async(rec.model_id)
    return {
        **warm,
        "profile": profile.__dict__,
        "recommendation": rec.__dict__,
        "model": spec.__dict__ if spec else None,
    }


@router.get("/{model_id}/status")
async def get_status(model_id: str) -> dict[str, Any]:
    registry = ModelRegistry.get()
    spec = (registry.get_llm_spec(model_id) or
            registry.get_embedding_spec(model_id) or
            registry.get_image_spec(model_id) or
            registry.get_audio_spec(model_id) or
            registry.get_video_spec(model_id))
    if not spec:
        raise HTTPException(404, f"Model bulunamadı: {model_id}")

    engine = LLMEngine.get()
    progress = registry.get_progress(model_id)

    if registry.get_image_spec(model_id):
        downloaded = registry.is_image_downloaded(model_id)
        try:
            from codegaai.core.image_engine import ImageEngine
            img_engine = ImageEngine.get()
            loaded = (img_engine.status.get("model_id") == model_id
                      and img_engine.is_ready)
        except Exception:
            loaded = False
        return {
            "model_id": model_id, "downloaded": downloaded,
            "loaded": loaded, "download": progress.to_dict(),
            "kind": "image",
        }

    if registry.get_audio_spec(model_id):
        audio_spec = registry.get_audio_spec(model_id)
        downloaded = registry.is_audio_downloaded(model_id)
        loaded = False
        try:
            from codegaai.core.audio_engine import TTSEngine, ASREngine
            if audio_spec.kind == "tts":
                eng = TTSEngine.get()
            else:
                eng = ASREngine.get()
            loaded = eng.status.get("model_id") == model_id and eng.is_ready
        except Exception:
            pass
        return {
            "model_id": model_id, "downloaded": downloaded,
            "loaded": loaded, "download": progress.to_dict(),
            "kind": f"audio-{audio_spec.kind}",
        }

    if registry.get_video_spec(model_id):
        downloaded = registry.is_video_downloaded(model_id)
        loaded = False
        try:
            from codegaai.core.video_engine import VideoEngine
            v_eng = VideoEngine.get()
            loaded = (v_eng.status.get("model_id") == model_id
                      and v_eng.is_ready)
        except Exception:
            pass
        return {
            "model_id": model_id, "downloaded": downloaded,
            "loaded": loaded, "download": progress.to_dict(),
            "kind": "video",
        }

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
    # Registry'yi tazele — disk değişmiş olabilir
    try:
        ModelRegistry._instance = None
    except Exception:
        pass
    registry = ModelRegistry.get()

    # LLM (single GGUF file)
    if registry.get_llm_spec(model_id):
        if registry.is_llm_downloaded(model_id):
            return {"status": "already_downloaded", "model_id": model_id,
                    "progress": registry.get_progress(model_id).to_dict()}
        registry.download_llm_async(model_id)
        return {"status": "started", "model_id": model_id,
                "progress": registry.get_progress(model_id).to_dict()}

    # Image (multi-file diffusion repo)
    if registry.get_image_spec(model_id):
        if registry.is_image_downloaded(model_id):
            return {"status": "already_downloaded", "model_id": model_id,
                    "progress": registry.get_progress(model_id).to_dict()}
        registry.download_snapshot_async(model_id, spec_kind="image")
        return {"status": "started", "model_id": model_id,
                "progress": registry.get_progress(model_id).to_dict()}

    # Audio (TTS / ASR)
    if registry.get_audio_spec(model_id):
        if registry.is_audio_downloaded(model_id):
            return {"status": "already_downloaded", "model_id": model_id,
                    "progress": registry.get_progress(model_id).to_dict()}
        registry.download_snapshot_async(model_id, spec_kind="audio")
        return {"status": "started", "model_id": model_id,
                "progress": registry.get_progress(model_id).to_dict()}

    # Video
    if registry.get_video_spec(model_id):
        if registry.is_video_downloaded(model_id):
            return {"status": "already_downloaded", "model_id": model_id,
                    "progress": registry.get_progress(model_id).to_dict()}
        registry.download_snapshot_async(model_id, spec_kind="video")
        return {"status": "started", "model_id": model_id,
                "progress": registry.get_progress(model_id).to_dict()}

    # Embedding — snapshot_download ile gercek indirme (Faz 8.2'de aktif)
    if registry.get_embedding_spec(model_id):
        if registry.is_embedding_downloaded(model_id):
            return {"status": "already_downloaded", "model_id": model_id,
                    "progress": registry.get_progress(model_id).to_dict()}
        registry.download_snapshot_async(model_id, spec_kind="embedding")
        return {"status": "started", "model_id": model_id,
                "progress": registry.get_progress(model_id).to_dict()}

    raise HTTPException(404, f"Model bulunamadı: {model_id}")


@router.post("/{model_id}/cancel")
async def cancel_download(model_id: str) -> dict[str, Any]:
    registry = ModelRegistry.get()
    cancelled = registry.cancel_download(model_id)
    return {"cancelled": cancelled, "model_id": model_id}


@router.post("/{model_id}/load")
async def load_model(model_id: str,
                     n_ctx: int = 0,
                     n_gpu_layers: int = -1,
                     force_cpu_offload: bool = False) -> dict[str, Any]:
    """LLM, embedding veya image modelini belleğe yükle."""
    registry = ModelRegistry.get()

    if registry.get_llm_spec(model_id):
        engine = LLMEngine.get()
        try:
            engine.load(model_id, n_ctx=n_ctx, n_gpu_layers=n_gpu_layers)
            if not engine.is_ready:
                status = engine.status
                err = status.get("error") or "Model yuklenemedi; motor hazir duruma gecmedi."
                raise RuntimeError(err)
        except RuntimeError as exc:
            raise HTTPException(409, str(exc))
        except OSError as exc:
            raise _llm_load_error_response(engine, exc)
        except Exception as exc:
            raise _llm_load_error_response(engine, exc)
        return {"loaded": True, "engine": engine.status}

    if registry.get_embedding_spec(model_id):
        svc = EmbeddingService.get()
        try:
            svc.load(model_id)
        except Exception as exc:
            raise HTTPException(500, f"Embedding yükleme başarısız: {exc}")
        return {"loaded": True, "embedding": svc.status}

    if registry.get_image_spec(model_id):
        from codegaai.core.image_engine import ImageEngine
        img = ImageEngine.get()
        try:
            img.load(model_id, force_cpu_offload=force_cpu_offload)
        except RuntimeError as exc:
            raise HTTPException(409, str(exc))
        except Exception as exc:
            raise HTTPException(500, f"Image yükleme başarısız: {exc}")
        return {"loaded": True, "image": img.status}

    if registry.get_audio_spec(model_id):
        spec = registry.get_audio_spec(model_id)
        from codegaai.core.audio_engine import TTSEngine, ASREngine
        eng = TTSEngine.get() if spec.kind == "tts" else ASREngine.get()
        try:
            eng.load(model_id)
        except RuntimeError as exc:
            raise HTTPException(409, str(exc))
        except Exception as exc:
            raise HTTPException(500, f"{spec.kind.upper()} yükleme başarısız: {exc}")
        return {"loaded": True, "audio": eng.status}

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

    if registry.get_image_spec(model_id):
        from codegaai.core.image_engine import ImageEngine
        img = ImageEngine.get()
        if img.status.get("model_id") == model_id:
            img.unload()
        return {"unloaded": True}

    if registry.get_audio_spec(model_id):
        spec = registry.get_audio_spec(model_id)
        from codegaai.core.audio_engine import TTSEngine, ASREngine
        eng = TTSEngine.get() if spec.kind == "tts" else ASREngine.get()
        if eng.status.get("model_id") == model_id:
            eng.unload()
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

    if registry.get_image_spec(model_id):
        from codegaai.core.image_engine import ImageEngine
        img = ImageEngine.get()
        if img.status.get("model_id") == model_id:
            img.unload()
        return {"deleted": registry.delete_image(model_id)}

    if registry.get_audio_spec(model_id):
        spec = registry.get_audio_spec(model_id)
        from codegaai.core.audio_engine import TTSEngine, ASREngine
        eng = TTSEngine.get() if spec.kind == "tts" else ASREngine.get()
        if eng.status.get("model_id") == model_id:
            eng.unload()
        return {"deleted": registry.delete_audio(model_id)}

    raise HTTPException(404, f"Model bulunamadı: {model_id}")
