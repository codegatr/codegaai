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
        """Embedding modelini belleğe yükle.

        scipy bağımlılığını kaldırmak için sentence-transformers wrapper'ı
        yerine direkt transformers (AutoModel + AutoTokenizer) kullanıyoruz.
        BGE-M3 zaten XLMRoberta tabanlı, manuel CLS pooling ile çalışır.
        """
        registry = ModelRegistry.get()
        spec = registry.get_embedding_spec(model_id)
        if not spec:
            raise ValueError(f"Bilinmeyen embedding modeli: {model_id}")

        with self._lock:
            if self.is_ready and self._status.model_id == model_id:
                return

            self._status = EmbeddingStatus(
                state="loading", model_id=model_id, dimensions=spec.dimensions,
            )

            try:
                # Lazy import — sadece transformers + torch (scipy YOK)
                import torch  # type: ignore[import-not-found]
                from transformers import (  # type: ignore[import-not-found]
                    AutoTokenizer, AutoModel,
                )

                target_dir = registry.embedding_dir_path(model_id)
                cache_root = str(CACHE_DIR / "huggingface")

                model_source = (
                    str(target_dir)
                    if registry.is_embedding_downloaded(model_id)
                    else spec.hf_repo
                )

                log.info("Embedding modeli yükleniyor (transformers): %s",
                         model_source)

                # tqdm ve progress bar — PyInstaller frozen modda hata verir
                import sys, os
                os.environ["TQDM_DISABLE"] = "1"
                if getattr(sys, "frozen", False):
                    try:
                        import transformers.utils.logging as _tfl
                        _tfl.disable_progress_bar()
                        _tfl.set_verbosity_error()
                    except Exception:
                        pass

                tokenizer = AutoTokenizer.from_pretrained(
                    model_source, cache_dir=cache_root,
                )
                model = AutoModel.from_pretrained(
                    model_source, cache_dir=cache_root,
                )

                # CUDA varsa GPU'ya taşı
                device = "cuda" if torch.cuda.is_available() else "cpu"
                model = model.to(device).eval()

                self._model = {
                    "tokenizer": tokenizer,
                    "model": model,
                    "device": device,
                    "torch": torch,
                }

                self._status = EmbeddingStatus(
                    state="ready", model_id=model_id,
                    dimensions=spec.dimensions, loaded_at=time.time(),
                )
                log.info("Embedding hazır: %s (%dD, %s)",
                         model_id, spec.dimensions, device)

            except Exception as exc:
                log.exception("Embedding yüklemesi başarısız: %s", exc)
                self._status = EmbeddingStatus(
                    state="error", model_id=model_id, error=str(exc),
                )
                raise

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Metinleri vektörlere çevir (BGE-M3: 1024D, normalize edilmiş)."""
        if not self.is_ready:
            self.load()

        if not texts:
            return []

        with self._lock:
            torch = self._model["torch"]
            tokenizer = self._model["tokenizer"]
            model = self._model["model"]
            device = self._model["device"]

            # Tokenize
            inputs = tokenizer(
                texts,
                padding=True,
                truncation=True,
                return_tensors="pt",
                max_length=512,
            )
            inputs = {k: v.to(device) for k, v in inputs.items()}

            # Forward pass — gradient yok
            with torch.no_grad():
                outputs = model(**inputs)

            # BGE-M3 için CLS token pooling
            embeddings = outputs.last_hidden_state[:, 0]

            # L2 normalize (cosine similarity için)
            embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)

            return embeddings.cpu().tolist()

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
