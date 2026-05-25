"""
codegaai.core.model_warmup
==========================

Non-blocking LLM warmup helpers.
"""
from __future__ import annotations

import threading
from typing import Any

from codegaai.utils.logger import get_logger

log = get_logger(__name__)

_warmups: set[str] = set()
_warmups_lock = threading.Lock()


def warm_model_async(model_id: str, n_ctx: int = 0, n_gpu_layers: int = -1) -> dict[str, Any]:
    """Start loading a downloaded LLM in the background without blocking chat."""
    from codegaai.core.engine import LLMEngine

    engine = LLMEngine.get()
    status = engine.status
    if status.get("model_id") == model_id and status.get("ready"):
        return {"status": "already_ready", "model_id": model_id, "engine": status}
    if status.get("model_id") == model_id and status.get("state") == "loading":
        return {"status": "already_loading", "model_id": model_id, "engine": status}

    with _warmups_lock:
        if model_id in _warmups:
            return {"status": "already_loading", "model_id": model_id, "engine": status}
        _warmups.add(model_id)

    def _worker() -> None:
        try:
            log.info("LLM arka plan isıtması başladı: %s", model_id)
            engine.load(model_id, n_ctx=n_ctx, n_gpu_layers=n_gpu_layers)
            log.info("LLM arka plan isıtması tamamlandı: %s", model_id)
        except Exception as exc:
            log.warning("LLM arka plan isıtması başarısız (%s): %s", model_id, exc)
        finally:
            with _warmups_lock:
                _warmups.discard(model_id)

    thread = threading.Thread(
        target=_worker,
        name=f"codegaai-model-warmup-{model_id}",
        daemon=True,
    )
    thread.start()
    return {"status": "started", "model_id": model_id, "engine": status}
