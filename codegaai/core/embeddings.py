"""
codegaai.core.embeddings
=========================

Embedding servisi — BGE-M3 (BAAI), Türkçe için en iyi açık model.

sentence-transformers ile lazy yüklenir. İlk çağrıda HuggingFace'ten
otomatik indirilir (yaklaşık 2.3 GB). Sonraki çalıştırmalarda yerel
önbellekten yüklenir.

Kullanım:

    svc = EmbeddingService.get()
    svc.load()                   # opsiyonel, ilk embed() de yükler
    vectors = svc.embed(["merhaba", "selam"])  # list[list[float]]
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any, Optional

from codegaai.config import CACHE_DIR
from codegaai.core.models_registry import ModelRegistry
from codegaai.utils.logger import get_logger

log = get_logger(__name__)


@dataclass
class EmbeddingStatus:
    state: str = "unloaded"          # unloaded | loading | ready | error
    model_id: Optional[str] = None
    dimensions: int = 0
    loaded_at: Optional[float] = None
    error: Optional[str] = None


class EmbeddingService:
    """BGE-M3 embedding hizmeti. Singleton."""

    _instance: Optional["EmbeddingService"] = None
    _instance_lock = threading.Lock()

    DEFAULT_MODEL_ID = "bge-m3"

    def __init__(self) -> None:
        self._model = None  # type: Any
        self._status = EmbeddingStatus()
        self._lock = threading.RLock()

    @classmethod
    def get(cls) -> "EmbeddingService":
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @property
    def is_ready(self) -> bool:
        return self._status.state == "ready"

    @property
    def status(self) -> dict[str, Any]:
        s = self._status
        return {
            "state": s.state,
            "model_id": s.model_id,
            "dimensions": s.dimensions,
            "loaded_at": s.loaded_at,
            "error": s.error,
            "ready": s.state == "ready",
        }

    def load(self, model_id: str = DEFAULT_MODEL_ID) -> None:
        """Embedding modelini belleğe yükle."""
        registry = ModelRegistry.get()
        spec = registry.get_embedding_spec(model_id)
        if not spec:
            raise ValueError(f"Bilinmeyen embedding modeli: {model_id}")

        with self._lock:
            if self.is_ready and self._status.model_id == model_id:
                return  # zaten yüklü

            self._status = EmbeddingStatus(
                state="loading", model_id=model_id, dimensions=spec.dimensions,
            )

            try:
                # Lazy import
                from sentence_transformers import SentenceTransformer  # type: ignore[import-not-found]

                # sentence-transformers HF Hub'dan otomatik indirir
                # ve önbelleğe alır (HF_HOME/CACHE_DIR ile yönetilir).
                cache_root = str(CACHE_DIR / "huggingface")
                target_dir = registry.embedding_dir_path(model_id)

                # Yerel dizin tam (config.json + weights + tokenizer) ise
                # oradan yükle, değilse HF'den otomatik indir.
                model_source = (
                    str(target_dir)
                    if registry.is_embedding_downloaded(model_id)
                    else spec.hf_repo
                )

                self._model = SentenceTransformer(
                    model_source,
                    cache_folder=cache_root,
                )

                self._status = EmbeddingStatus(
                    state="ready", model_id=model_id,
                    dimensions=spec.dimensions, loaded_at=time.time(),
                )
                log.info("Embedding modeli hazır: %s (%dD)",
                         model_id, spec.dimensions)

            except Exception as exc:
                log.exception("Embedding yüklemesi başarısız: %s", exc)
                self._status = EmbeddingStatus(
                    state="error", model_id=model_id, error=str(exc),
                )
                raise

    def embed(self, texts: list[str]) -> list[list[float]]:
        """
        Metinleri vektörlere çevir.

        Returns:
            len(texts) adet vektör (her biri 1024-boyutlu BGE-M3 için).
        """
        if not self.is_ready:
            self.load()

        if not texts:
            return []

        with self._lock:
            vectors = self._model.encode(
                texts,
                normalize_embeddings=True,  # cosine similarity için
                show_progress_bar=False,
                convert_to_numpy=True,
            )
            return vectors.tolist()

    def embed_one(self, text: str) -> list[float]:
        return self.embed([text])[0]

    def unload(self) -> None:
        with self._lock:
            self._model = None
            self._status = EmbeddingStatus()
            try:
                import gc
                gc.collect()
            except Exception:
                pass
