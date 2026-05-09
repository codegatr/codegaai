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

import os
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


@dataclass(frozen=True)
class ImageModelSpec:
    """Diffusion tabanlı görsel üretim modeli (multi-file HF repo)."""
    id: str
    name: str
    hf_repo: str               # örn: stabilityai/stable-diffusion-xl-base-1.0
    size_gb: float
    vram_gb: float
    pipeline: str              # "sdxl" | "sdxl-turbo" | "flux"
    default_steps: int = 30
    default_guidance: float = 7.5
    default_width: int = 1024
    default_height: int = 1024
    description: str = ""
    default: bool = False


@dataclass(frozen=True)
class AudioModelSpec:
    """Ses modeli — TTS veya ASR."""
    id: str
    name: str
    kind: str                  # "tts" | "asr"
    hf_repo: str
    size_gb: float
    vram_gb: float
    languages: tuple[str, ...] = ("tr", "en")
    sample_rate: int = 22050   # TTS için varsayılan
    description: str = ""
    default: bool = False


@dataclass(frozen=True)
class VideoModelSpec:
    """Video üretim modeli (text-to-video veya image-to-video)."""
    id: str
    name: str
    hf_repo: str
    size_gb: float
    vram_gb: float
    pipeline: str              # "cogvideox" | "svd"
    mode: str                  # "t2v" | "i2v"
    default_steps: int = 50
    default_guidance: float = 6.0
    default_frames: int = 49
    default_fps: int = 8
    default_width: int = 720
    default_height: int = 480
    description: str = ""
    default: bool = False


# ============================================================
# Katalog
# ============================================================

LLM_MODELS: tuple[LLMModelSpec, ...] = (
    LLMModelSpec(
        id="qwen2.5-7b-instruct-q4_k_m",
        name="Qwen 2.5 7B Instruct (Q4_K_M)",
        hf_repo="bartowski/Qwen2.5-7B-Instruct-GGUF",
        hf_file="Qwen2.5-7B-Instruct-Q4_K_M.gguf",
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
        hf_repo="bartowski/Qwen2.5-Coder-7B-Instruct-GGUF",
        hf_file="Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
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


IMAGE_MODELS: tuple[ImageModelSpec, ...] = (
    ImageModelSpec(
        id="sdxl-base-1.0",
        name="Stable Diffusion XL 1.0 (Base)",
        hf_repo="stabilityai/stable-diffusion-xl-base-1.0",
        size_gb=6.94,
        vram_gb=8.0,
        pipeline="sdxl",
        default_steps=30,
        default_guidance=7.5,
        default_width=1024,
        default_height=1024,
        description="Foto-gerçekçi, 1024×1024 üretim. RTX 3060 12GB için ideal.",
        default=True,
    ),
    ImageModelSpec(
        id="sdxl-turbo",
        name="SDXL Turbo (1-step)",
        hf_repo="stabilityai/sdxl-turbo",
        size_gb=6.94,
        vram_gb=8.0,
        pipeline="sdxl-turbo",
        default_steps=1,
        default_guidance=0.0,
        default_width=512,
        default_height=512,
        description="Tek adımda anlık üretim. Hız > kalite.",
    ),
    ImageModelSpec(
        id="flux.1-schnell",
        name="FLUX.1-schnell (Black Forest Labs)",
        hf_repo="black-forest-labs/FLUX.1-schnell",
        size_gb=23.8,
        vram_gb=24.0,
        pipeline="flux",
        default_steps=4,
        default_guidance=0.0,
        default_width=1024,
        default_height=1024,
        description=("En iyi açık T2I modeli. 24 GB VRAM ister; 12GB'da CPU "
                     "offload ile çalışır ama yavaş."),
    ),
)


AUDIO_MODELS: tuple[AudioModelSpec, ...] = (
    AudioModelSpec(
        id="xtts-v2",
        name="XTTS v2 (Coqui)",
        kind="tts",
        hf_repo="coqui/XTTS-v2",
        size_gb=1.87,
        vram_gb=2.0,
        languages=("tr", "en", "es", "fr", "de", "it", "pt", "pl", "ru",
                   "nl", "cs", "ar", "zh", "ja", "ko", "hu"),
        sample_rate=24000,
        description="17 dil destekli, 6 sn referans sesle ses kopyalama.",
        default=True,
    ),
    AudioModelSpec(
        id="piper-tr-medium",
        name="Piper TR (medium)",
        kind="tts",
        hf_repo="rhasspy/piper-voices",
        size_gb=0.06,
        vram_gb=0.0,
        languages=("tr",),
        sample_rate=22050,
        description="Hafif, hızlı CPU TTS. Sadece Türkçe.",
    ),
    AudioModelSpec(
        id="faster-whisper-large-v3",
        name="Faster Whisper Large v3",
        kind="asr",
        hf_repo="Systran/faster-whisper-large-v3",
        size_gb=2.88,
        vram_gb=4.0,
        languages=("tr", "en", "ar", "fr", "de", "es", "ru", "zh", "ja",
                   "ko", "it", "pt", "nl", "pl", "tr", "uk", "vi"),
        description="OpenAI Whisper Large v3'ün CTranslate2 hızlandırılmış sürümü.",
        default=True,
    ),
    AudioModelSpec(
        id="faster-whisper-base",
        name="Faster Whisper Base",
        kind="asr",
        hf_repo="Systran/faster-whisper-base",
        size_gb=0.14,
        vram_gb=1.0,
        languages=("tr", "en"),
        description="Hızlı, hafif. CPU'da bile çalışır.",
    ),
)


VIDEO_MODELS: tuple[VideoModelSpec, ...] = (
    VideoModelSpec(
        id="cogvideox-2b",
        name="CogVideoX-2B (THUDM)",
        hf_repo="THUDM/CogVideoX-2b",
        size_gb=10.5,
        vram_gb=12.0,
        pipeline="cogvideox",
        mode="t2v",
        default_steps=50,
        default_guidance=6.0,
        default_frames=49,
        default_fps=8,
        default_width=720,
        default_height=480,
        description="Text-to-video, 6 sn ~720x480 @ 8 fps. RTX 3060 12GB tam yetiyor.",
        default=True,
    ),
    VideoModelSpec(
        id="cogvideox-5b",
        name="CogVideoX-5B (THUDM)",
        hf_repo="THUDM/CogVideoX-5b",
        size_gb=22.0,
        vram_gb=24.0,
        pipeline="cogvideox",
        mode="t2v",
        default_steps=50,
        default_guidance=7.0,
        default_frames=49,
        default_fps=8,
        default_width=720,
        default_height=480,
        description="Daha kaliteli ama 24 GB VRAM ister; 12 GB'da CPU offload zorunlu.",
    ),
    VideoModelSpec(
        id="svd-xt",
        name="Stable Video Diffusion XT (image-to-video)",
        hf_repo="stabilityai/stable-video-diffusion-img2vid-xt",
        size_gb=9.6,
        vram_gb=10.0,
        pipeline="svd",
        mode="i2v",
        default_steps=25,
        default_guidance=3.0,
        default_frames=25,
        default_fps=7,
        default_width=1024,
        default_height=576,
        description="Bir görseli 25 kareye animasyona çevirir.",
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
        self.image_dir = MODELS_DIR / "image"
        self.video_dir = MODELS_DIR / "video"
        self.audio_dir = MODELS_DIR / "audio"
        for d in (self.llm_dir, self.embedding_dir, self.image_dir,
                  self.video_dir, self.audio_dir):
            d.mkdir(parents=True, exist_ok=True)

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
    def list_image_models() -> list[dict[str, Any]]:
        return [
            {
                "id": m.id, "name": m.name,
                "type": "image",
                "hf_repo": m.hf_repo,
                "size_gb": m.size_gb, "vram_gb": m.vram_gb,
                "pipeline": m.pipeline,
                "default_steps": m.default_steps,
                "default_guidance": m.default_guidance,
                "default_width": m.default_width,
                "default_height": m.default_height,
                "description": m.description,
                "default": m.default,
            }
            for m in IMAGE_MODELS
        ]

    @staticmethod
    def list_audio_models() -> list[dict[str, Any]]:
        return [
            {
                "id": m.id, "name": m.name,
                "type": "audio",
                "kind": m.kind,
                "hf_repo": m.hf_repo,
                "size_gb": m.size_gb, "vram_gb": m.vram_gb,
                "languages": list(m.languages),
                "sample_rate": m.sample_rate,
                "description": m.description,
                "default": m.default,
            }
            for m in AUDIO_MODELS
        ]

    @staticmethod
    def list_video_models() -> list[dict[str, Any]]:
        return [
            {
                "id": m.id, "name": m.name,
                "type": "video",
                "hf_repo": m.hf_repo,
                "size_gb": m.size_gb, "vram_gb": m.vram_gb,
                "pipeline": m.pipeline,
                "mode": m.mode,
                "default_steps": m.default_steps,
                "default_guidance": m.default_guidance,
                "default_frames": m.default_frames,
                "default_fps": m.default_fps,
                "default_width": m.default_width,
                "default_height": m.default_height,
                "description": m.description,
                "default": m.default,
            }
            for m in VIDEO_MODELS
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

    @staticmethod
    def get_image_spec(model_id: str) -> Optional[ImageModelSpec]:
        for m in IMAGE_MODELS:
            if m.id == model_id:
                return m
        return None

    @staticmethod
    def get_audio_spec(model_id: str) -> Optional[AudioModelSpec]:
        for m in AUDIO_MODELS:
            if m.id == model_id:
                return m
        return None

    @staticmethod
    def get_video_spec(model_id: str) -> Optional[VideoModelSpec]:
        for m in VIDEO_MODELS:
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

    def image_dir_path(self, model_id: str) -> Path:
        spec = self.get_image_spec(model_id)
        if not spec:
            raise ValueError(f"Bilinmeyen image modeli: {model_id}")
        return self.image_dir / model_id

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
        # Sentence-transformers paketinin gerektirdigi temel dosyalar
        # config.json HER ZAMAN olmali. Model agirligi safetensors veya
        # pytorch_model.bin olarak gelebilir.
        if not (d / "config.json").exists():
            return False
        # Tokenizer + model agirligi
        has_weights = any([
            (d / "model.safetensors").exists(),
            (d / "pytorch_model.bin").exists(),
            (d / "onnx").is_dir(),
        ])
        has_tokenizer = any([
            (d / "tokenizer.json").exists(),
            (d / "sentencepiece.bpe.model").exists(),
            (d / "vocab.txt").exists(),
        ])
        return has_weights and has_tokenizer

    def is_image_downloaded(self, model_id: str) -> bool:
        spec = self.get_image_spec(model_id)
        if not spec:
            return False
        d = self.image_dir_path(model_id)
        if not d.exists():
            return False
        # Diffusers repolarında model_index.json bulunur (pipeline tanımı)
        # Ayrıca .from_pretrained alt klasörlerden okuyabilmeli.
        if (d / "model_index.json").exists():
            return True
        # FLUX ve bazı yeni modeller farklı yapıda
        if (d / "transformer").exists() or (d / "unet").exists():
            return True
        return False

    def audio_dir_path(self, model_id: str) -> Path:
        spec = self.get_audio_spec(model_id)
        if not spec:
            raise ValueError(f"Bilinmeyen audio modeli: {model_id}")
        return self.audio_dir / model_id

    def is_audio_downloaded(self, model_id: str) -> bool:
        spec = self.get_audio_spec(model_id)
        if not spec:
            return False
        d = self.audio_dir_path(model_id)
        if not d.exists():
            return False
        # TTS modelleri config.json + model dosyası içerir
        # ASR (faster-whisper) model.bin + tokenizer içerir
        if spec.kind == "asr":
            return (d / "model.bin").exists() or any(d.glob("*.bin"))
        # TTS
        return (d / "config.json").exists() or any(d.glob("*.pth"))

    def delete_audio(self, model_id: str) -> bool:
        d = self.audio_dir_path(model_id)
        if d.exists():
            shutil.rmtree(d)
            log.info("Audio modeli silindi: %s", model_id)
            with self._progress_lock:
                self._progress.pop(model_id, None)
            return True
        return False

    def video_dir_path(self, model_id: str) -> Path:
        spec = self.get_video_spec(model_id)
        if not spec:
            raise ValueError(f"Bilinmeyen video modeli: {model_id}")
        return self.video_dir / model_id

    def is_video_downloaded(self, model_id: str) -> bool:
        spec = self.get_video_spec(model_id)
        if not spec:
            return False
        d = self.video_dir_path(model_id)
        if not d.exists():
            return False
        # Diffusion video modelleri model_index.json içerir
        if (d / "model_index.json").exists():
            return True
        if (d / "transformer").exists() or (d / "unet").exists():
            return True
        return False

    def delete_video(self, model_id: str) -> bool:
        d = self.video_dir_path(model_id)
        if d.exists():
            shutil.rmtree(d)
            log.info("Video modeli silindi: %s", model_id)
            with self._progress_lock:
                self._progress.pop(model_id, None)
            return True
        return False

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

        # Önceki indirme hata/iptal ile bittiyse partial dosyayı temizle
        prev = self.get_progress(spec.id)
        if prev.status in ("error", "cancelled") and partial.exists():
            log.info("Önceki başarısız indirmeden kalan .part siliniyor: %s",
                     partial.name)
            try:
                partial.unlink()
            except Exception:
                pass

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
            # Windows'ta Path.rename hedef dosya varsa WinError 183 atar.
            # os.replace cross-platform atomik overwrite yapar.
            if target.exists():
                log.warning("Hedef dosya mevcut, üzerine yazılıyor: %s",
                            target.name)
            os.replace(partial, target)
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

    # ---- silme ----

    def delete_image(self, model_id: str) -> bool:
        d = self.image_dir_path(model_id)
        if d.exists():
            shutil.rmtree(d)
            log.info("Image modeli silindi: %s", model_id)
            with self._progress_lock:
                self._progress.pop(model_id, None)
            return True
        return False

    # ---- snapshot indirme (image / video / TTS gibi multi-file modeller) ----

    def download_snapshot_async(self, model_id: str,
                                 spec_kind: str = "image") -> threading.Thread:
        """
        HuggingFace snapshot_download ile multi-file repo indir.

        Args:
            spec_kind: "image" | "audio"
        """
        if spec_kind == "image":
            spec = self.get_image_spec(model_id)
            target_dir = self.image_dir_path(model_id) if spec else None
        elif spec_kind == "audio":
            spec = self.get_audio_spec(model_id)
            target_dir = self.audio_dir_path(model_id) if spec else None
        elif spec_kind == "video":
            spec = self.get_video_spec(model_id)
            target_dir = self.video_dir_path(model_id) if spec else None
        elif spec_kind == "embedding":
            spec = self.get_embedding_spec(model_id)
            target_dir = self.embedding_dir_path(model_id) if spec else None
        else:
            raise ValueError(f"Henüz desteklenmiyor: {spec_kind}")

        if not spec:
            raise ValueError(f"Bilinmeyen model: {model_id}")

        # Zaten var mı?
        already = False
        if spec_kind == "image":
            already = self.is_image_downloaded(model_id)
        elif spec_kind == "audio":
            already = self.is_audio_downloaded(model_id)
        elif spec_kind == "video":
            already = self.is_video_downloaded(model_id)
        elif spec_kind == "embedding":
            already = self.is_embedding_downloaded(model_id)

        if already:
            self._set_progress(model_id, status="completed",
                               downloaded=int(spec.size_gb * 1024**3),
                               total=int(spec.size_gb * 1024**3))
            t = threading.Thread(target=lambda: None)
            t.start()
            return t

        cur = self.get_progress(model_id)
        if cur.status == "downloading":
            log.warning("%s zaten indiriliyor.", model_id)
            t = threading.Thread(target=lambda: None)
            t.start()
            return t

        cancel = threading.Event()
        self._cancel_flags[model_id] = cancel

        thread = threading.Thread(
            target=self._download_snapshot_worker,
            args=(model_id, spec, target_dir, cancel),
            daemon=True,
            name=f"download-{model_id}",
        )
        thread.start()
        return thread

    def _download_snapshot_worker(self, model_id: str, spec,
                                   target_dir: Path,
                                   cancel: threading.Event) -> None:
        import time

        expected_total = int(spec.size_gb * (1024 ** 3))
        self._set_progress(
            model_id, status="downloading", downloaded=0,
            total=expected_total, error=None,
            started_at=time.time(), completed_at=None,
        )
        log.info("Snapshot indirme başladı: %s -> %s", spec.hf_repo, target_dir)

        # Filesystem-tabanlı ilerleme izleme thread'i
        stop_monitor = threading.Event()

        def monitor():
            last_bytes = 0
            last_t = time.time()
            while not stop_monitor.is_set():
                try:
                    if target_dir.exists():
                        cur = sum(p.stat().st_size
                                  for p in target_dir.rglob("*") if p.is_file())
                        now = time.time()
                        speed = (cur - last_bytes) / max(now - last_t, 0.1)
                        self._set_progress(
                            model_id, downloaded=cur, speed_bps=speed,
                        )
                        last_bytes = cur
                        last_t = now
                except Exception:
                    pass
                time.sleep(1.0)

        mon_thread = threading.Thread(target=monitor, daemon=True)
        mon_thread.start()

        try:
            # Lazy import
            from huggingface_hub import snapshot_download

            target_dir.mkdir(parents=True, exist_ok=True)

            snapshot_download(
                repo_id=spec.hf_repo,
                local_dir=str(target_dir),
                local_dir_use_symlinks=False,
                resume_download=True,
                # max_workers: paralel parça indirme
                max_workers=4,
            )

            stop_monitor.set()

            if cancel.is_set():
                self._set_progress(
                    model_id, status="cancelled",
                    completed_at=time.time(),
                )
                return

            # Final boyut
            final = sum(p.stat().st_size
                        for p in target_dir.rglob("*") if p.is_file())
            self._set_progress(
                model_id, status="completed",
                downloaded=final, total=final,
                speed_bps=0.0, completed_at=time.time(),
            )
            log.info("Snapshot tamamlandı: %s (%.2f GB)",
                     model_id, final / 1e9)

        except Exception as exc:
            stop_monitor.set()
            log.exception("Snapshot indirme hatası: %s", exc)
            self._set_progress(
                model_id, status="error", error=str(exc),
                completed_at=time.time(),
            )
        finally:
            self._cancel_flags.pop(model_id, None)

    # ---- özet ----

    def disk_usage(self) -> dict[str, int]:
        """Modeller dizininin toplam disk kullanımı (bytes)."""
        total = 0
        for p in MODELS_DIR.rglob("*"):
            if p.is_file():
                total += p.stat().st_size
        return {"bytes": total, "mb": total // (1024 ** 2),
                "gb": round(total / (1024 ** 3), 2)}
