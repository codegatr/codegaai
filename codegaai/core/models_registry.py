"""
codegaai.core.models_registry
==============================

Model kataloğu ve indirme yöneticisi.

Her model şunları bildirir: id, görünen ad, HuggingFace repo+dosya,
boyut, VRAM gereksinimi, yerel kayıt yolu.

LLM modelleri tek dosyalı GGUF formatında — doğrudan httpx ile
indirilir, ilerleme takip edilir, tekrar başlatılabilir.

Kullanım:

    reg = ModelRegistry()
    models = reg.list_llm_models()       # katalog
    info = reg.is_downloaded("qwen2.5-7b-instruct-q4_k_m")
    reg.download_llm("qwen2.5-7b-instruct-q4_k_m")  # arkaplan thread
    progress = reg.get_progress("qwen2.5-7b-instruct-q4_k_m")
"""

from __future__ import annotations

import shutil
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from codegaai.config import MODELS_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)


# ============================================================
# Model tanımları
# ============================================================

@dataclass(frozen=True)
class LLMModelSpec:
    """Tek dosyalı GGUF model tanımı."""
    id: str
    name: str
    hf_repo: str               # örn: Qwen/Qwen2.5-7B-Instruct-GGUF
    hf_file: str               # örn: qwen2.5-7b-instruct-q4_k_m.gguf
    size_gb: float
    vram_gb: float
    languages: tuple[str, ...] = ("tr", "en")
    context_length: int = 32768
    description: str = ""
    default: bool = False


@dataclass(frozen=True)
class EmbeddingModelSpec:
    """sentence-transformers ile yüklenen çoklu dosya modeli."""
    id: str
    name: str
    hf_repo: str               # örn: BAAI/bge-m3
    size_gb: float
    vram_gb: float
    dimensions: int
    max_tokens: int = 8192
    description: str = ""
    default: bool = False


# ============================================================
# Katalog
# ============================================================

LLM_MODELS: tuple[LLMModelSpec, ...] = (
    LLMModelSpec(
        id="qwen2.5-7b-instruct-q4_k_m",
        name="Qwen 2.5 7B Instruct (Q4_K_M)",
        hf_repo="Qwen/Qwen2.5-7B-Instruct-GGUF",
        hf_file="qwen2.5-7b-instruct-q4_k_m.gguf",
        size_gb=4.68,
        vram_gb=5.5,
        languages=("tr", "en", "zh", "ar", "fr", "de", "es", "ja"),
        context_length=32768,
        description="Türkçe başta olmak üzere 30+ dil. RTX 3060 için ideal.",
        default=True,
    ),
    LLMModelSpec(
        id="qwen2.5-coder-7b-instruct-q4_k_m",
        name="Qwen 2.5 Coder 7B (Q4_K_M)",
        hf_repo="Qwen/Qwen2.5-Coder-7B-Instruct-GGUF",
        hf_file="qwen2.5-coder-7b-instruct-q4_k_m.gguf",
        size_gb=4.68,
        vram_gb=5.5,
        languages=("en",),
        context_length=32768,
        description="Kod üretimi için özelleştirilmiş, 92+ dil destekli.",
    ),
    LLMModelSpec(
        id="llama-3.1-8b-instruct-q4_k_m",
        name="Llama 3.1 8B Instruct (Q4_K_M)",
        hf_repo="lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF",
        hf_file="Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
        size_gb=4.92,
        vram_gb=6.0,
        languages=("tr", "en"),
        context_length=131072,
        description="Meta'nın açık ağırlıklı modeli, geniş bağlam.",
    ),
    LLMModelSpec(
        id="aya-expanse-8b-q4_k_m",
        name="Aya Expanse 8B (Q4_K_M)",
        hf_repo="bartowski/aya-expanse-8b-GGUF",
        hf_file="aya-expanse-8b-Q4_K_M.gguf",
        size_gb=5.10,
        vram_gb=6.2,
        languages=("tr", "en", "ar", "fa", "ru", "zh", "ja", "ko", "vi"),
        context_length=8192,
        description="Cohere'in çok dilli modeli, Türkçesi güçlü.",
    ),
)


EMBEDDING_MODELS: tuple[EmbeddingModelSpec, ...] = (
    EmbeddingModelSpec(
        id="bge-m3",
        name="BGE-M3 (BAAI)",
        hf_repo="BAAI/bge-m3",
        size_gb=2.27,
        vram_gb=1.8,
        dimensions=1024,
        max_tokens=8192,
        description="100+ dil, Türkçe için en iyi açık embedding modeli.",
        default=True,
    ),
)


# ============================================================
# İndirme durumu
# ============================================================

@dataclass
class DownloadProgress:
    """Bir indirme görevinin anlık durumu."""
    model_id: str
    status: str = "idle"        # idle | downloading | completed | error | cancelled
    downloaded: int = 0          # bytes
    total: int = 0               # bytes
    speed_bps: float = 0.0
    error: Optional[str] = None
    started_at: Optional[float] = None
    completed_at: Optional[float] = None

    @property
    def percent(self) -> float:
        if self.total <= 0:
            return 0.0
        return min(100.0, (self.downloaded / self.total) * 100.0)

    def to_dict(self) -> dict[str, Any]:
        return {
            "model_id": self.model_id,
            "status": self.status,
            "downloaded": self.downloaded,
            "total": self.total,
            "percent": round(self.percent, 2),
            "speed_bps": round(self.speed_bps, 1),
            "error": self.error,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
        }


# ============================================================
# Registry
# ============================================================

class ModelRegistry:
    """
    Model kataloğu + indirme/silme operasyonları.

    Singleton — tek bir örnek thread-safe.
    """

    _instance: Optional["ModelRegistry"] = None
    _instance_lock = threading.Lock()

    def __init__(self) -> None:
        self.llm_dir = MODELS_DIR / "llm"
        self.embedding_dir = MODELS_DIR / "embedding"
        self.llm_dir.mkdir(parents=True, exist_ok=True)
        self.embedding_dir.mkdir(parents=True, exist_ok=True)

        self._progress: dict[str, DownloadProgress] = {}
        self._progress_lock = threading.Lock()
        self._cancel_flags: dict[str, threading.Event] = {}

    @classmethod
    def get(cls) -> "ModelRegistry":
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ---- katalog erişimi ----

    @staticmethod
    def list_llm_models() -> list[dict[str, Any]]:
        return [
            {
                "id": m.id, "name": m.name,
                "type": "llm",
                "hf_repo": m.hf_repo, "hf_file": m.hf_file,
                "size_gb": m.size_gb, "vram_gb": m.vram_gb,
                "languages": list(m.languages),
                "context_length": m.context_length,
                "description": m.description,
                "default": m.default,
            }
            for m in LLM_MODELS
        ]

    @staticmethod
    def list_embedding_models() -> list[dict[str, Any]]:
        return [
            {
                "id": m.id, "name": m.name,
                "type": "embedding",
                "hf_repo": m.hf_repo,
                "size_gb": m.size_gb, "vram_gb": m.vram_gb,
                "dimensions": m.dimensions,
                "max_tokens": m.max_tokens,
                "description": m.description,
                "default": m.default,
            }
            for m in EMBEDDING_MODELS
        ]

    @staticmethod
    def get_llm_spec(model_id: str) -> Optional[LLMModelSpec]:
        for m in LLM_MODELS:
            if m.id == model_id:
                return m
        return None

    @staticmethod
    def get_embedding_spec(model_id: str) -> Optional[EmbeddingModelSpec]:
        for m in EMBEDDING_MODELS:
            if m.id == model_id:
                return m
        return None

    # ---- yerel yollar ----

    def llm_path(self, model_id: str) -> Path:
        spec = self.get_llm_spec(model_id)
        if not spec:
            raise ValueError(f"Bilinmeyen LLM modeli: {model_id}")
        return self.llm_dir / f"{model_id}.gguf"

    def embedding_dir_path(self, model_id: str) -> Path:
        spec = self.get_embedding_spec(model_id)
        if not spec:
            raise ValueError(f"Bilinmeyen embedding modeli: {model_id}")
        return self.embedding_dir / model_id

    def is_llm_downloaded(self, model_id: str) -> bool:
        spec = self.get_llm_spec(model_id)
        if not spec:
            return False
        path = self.llm_path(model_id)
        if not path.exists():
            return False
        # Boyut kontrolü — kısmi indirme önle
        actual = path.stat().st_size
        expected_min = int(spec.size_gb * (1024 ** 3) * 0.95)
        return actual >= expected_min

    def is_embedding_downloaded(self, model_id: str) -> bool:
        spec = self.get_embedding_spec(model_id)
        if not spec:
            return False
        d = self.embedding_dir_path(model_id)
        if not d.exists():
            return False
        # Tipik transformer dosyaları var mı?
        required = ["config.json"]
        return all((d / f).exists() for f in required)

    # ---- indirme: LLM (httpx ile, ilerlemeli, resumable) ----

    def get_progress(self, model_id: str) -> DownloadProgress:
        with self._progress_lock:
            if model_id not in self._progress:
                self._progress[model_id] = DownloadProgress(model_id=model_id)
            return self._progress[model_id]

    def _set_progress(self, model_id: str, **kwargs) -> None:
        with self._progress_lock:
            p = self._progress.setdefault(
                model_id, DownloadProgress(model_id=model_id))
            for k, v in kwargs.items():
                setattr(p, k, v)

    def cancel_download(self, model_id: str) -> bool:
        flag = self._cancel_flags.get(model_id)
        if flag:
            flag.set()
            return True
        return False

    def download_llm_async(self, model_id: str) -> threading.Thread:
        """LLM indirmesini arka thread'de başlat."""
        spec = self.get_llm_spec(model_id)
        if not spec:
            raise ValueError(f"Bilinmeyen model: {model_id}")

        # Zaten indirilmiş mi?
        if self.is_llm_downloaded(model_id):
            self._set_progress(
                model_id, status="completed",
                downloaded=self.llm_path(model_id).stat().st_size,
                total=self.llm_path(model_id).stat().st_size,
            )
            t = threading.Thread(target=lambda: None)
            t.start()
            return t

        # Aynı model halen indiriliyor mu?
        cur = self.get_progress(model_id)
        if cur.status == "downloading":
            log.warning("%s zaten indiriliyor.", model_id)
            t = threading.Thread(target=lambda: None)
            t.start()
            return t

        cancel = threading.Event()
        self._cancel_flags[model_id] = cancel

        thread = threading.Thread(
            target=self._download_llm_worker,
            args=(spec, cancel),
            daemon=True,
            name=f"download-{model_id}",
        )
        thread.start()
        return thread

    def _download_llm_worker(self, spec: LLMModelSpec,
                             cancel: threading.Event) -> None:
        import time
        target = self.llm_path(spec.id)
        partial = target.with_suffix(target.suffix + ".part")
        url = f"https://huggingface.co/{spec.hf_repo}/resolve/main/{spec.hf_file}"

        self._set_progress(
            spec.id, status="downloading", downloaded=0, total=0,
            error=None, started_at=time.time(), completed_at=None,
        )
        log.info("İndirme başladı: %s -> %s", url, partial)

        try:
            import httpx

            # Resume desteği — partial varsa
            existing = partial.stat().st_size if partial.exists() else 0
            headers = {"User-Agent": "codegaai/0.3.0"}
            if existing > 0:
                headers["Range"] = f"bytes={existing}-"

            with httpx.Client(follow_redirects=True, timeout=60.0) as client:
                with client.stream("GET", url, headers=headers) as resp:
                    resp.raise_for_status()

                    # Toplam boyut
                    total_str = resp.headers.get("content-length", "0")
                    chunk_total = int(total_str)
                    grand_total = existing + chunk_total
                    self._set_progress(
                        spec.id, total=grand_total, downloaded=existing
                    )

                    # Yaz
                    mode = "ab" if existing > 0 else "wb"
                    last_emit = time.time()
                    last_bytes = existing
                    downloaded = existing

                    with partial.open(mode) as fp:
                        for chunk in resp.iter_bytes(chunk_size=1024 * 1024):
                            if cancel.is_set():
                                self._set_progress(
                                    spec.id, status="cancelled",
                                    completed_at=time.time(),
                                )
                                log.info("İndirme iptal edildi: %s", spec.id)
                                return

                            fp.write(chunk)
                            downloaded += len(chunk)

                            now = time.time()
                            if now - last_emit > 0.4:
                                speed = (downloaded - last_bytes) / (now - last_emit)
                                self._set_progress(
                                    spec.id, downloaded=downloaded,
                                    speed_bps=speed,
                                )
                                last_emit = now
                                last_bytes = downloaded

            # Tamamlandı — partial -> final
            partial.rename(target)
            self._set_progress(
                spec.id, status="completed",
                downloaded=target.stat().st_size,
                total=target.stat().st_size,
                speed_bps=0.0,
                completed_at=time.time(),
            )
            log.info("İndirme tamamlandı: %s (%s GB)",
                     spec.id, round(target.stat().st_size / 1e9, 2))

        except Exception as exc:
            log.exception("İndirme hatası: %s -> %s", spec.id, exc)
            self._set_progress(
                spec.id, status="error", error=str(exc),
                completed_at=time.time(),
            )
        finally:
            self._cancel_flags.pop(spec.id, None)

    # ---- silme ----

    def delete_llm(self, model_id: str) -> bool:
        spec = self.get_llm_spec(model_id)
        if not spec:
            return False
        target = self.llm_path(model_id)
        partial = target.with_suffix(target.suffix + ".part")
        deleted = False
        for p in (target, partial):
            if p.exists():
                p.unlink()
                deleted = True
        if deleted:
            with self._progress_lock:
                self._progress.pop(model_id, None)
            log.info("LLM modeli silindi: %s", model_id)
        return deleted

    def delete_embedding(self, model_id: str) -> bool:
        d = self.embedding_dir_path(model_id)
        if d.exists():
            shutil.rmtree(d)
            log.info("Embedding modeli silindi: %s", model_id)
            return True
        return False

    # ---- özet ----

    def disk_usage(self) -> dict[str, int]:
        """Modeller dizininin toplam disk kullanımı (bytes)."""
        total = 0
        for p in MODELS_DIR.rglob("*"):
            if p.is_file():
                total += p.stat().st_size
        return {"bytes": total, "mb": total // (1024 ** 2),
                "gb": round(total / (1024 ** 3), 2)}
