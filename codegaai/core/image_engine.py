"""
codegaai.core.image_engine
============================

Görsel üretim motoru — Hugging Face `diffusers` sarmalayıcısı.

3 pipeline türü destekler:
- **sdxl**: Stable Diffusion XL Base 1.0 (klasik, 30 adım)
- **sdxl-turbo**: Tek-adımlı hızlı üretim
- **flux**: FLUX.1-schnell (Black Forest Labs)

Lazy import: `diffusers` ve `torch` sadece `load()` çağrılınca import edilir.

VRAM optimizasyonu:
- 12 GB altı VRAM için `enable_model_cpu_offload()` otomatik açılır
- VAE slicing aktif edilir (büyük görsellerde OOM önler)

Kullanım:

    eng = ImageEngine.get()
    eng.load("sdxl-base-1.0")
    result = eng.generate(GenerationRequest(
        prompt="bir astronot Mars'ta at biniyor",
        steps=30, guidance=7.5, width=1024, height=1024,
    ))
"""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from codegaai.config import OUTPUTS_DIR
from codegaai.core.models_registry import ModelRegistry
from codegaai.utils.logger import get_logger

log = get_logger(__name__)

IMAGES_DIR = OUTPUTS_DIR / "images"


@dataclass
class GenerationRequest:
    prompt: str
    negative_prompt: str = ""
    steps: int = 30
    guidance: float = 7.5
    width: int = 1024
    height: int = 1024
    seed: Optional[int] = None
    num_images: int = 1


@dataclass
class ImageEngineStatus:
    state: str = "unloaded"          # unloaded | loading | ready | error | generating
    model_id: Optional[str] = None
    pipeline: Optional[str] = None
    backend: Optional[str] = None    # cuda | cpu
    cpu_offload: bool = False
    loaded_at: Optional[float] = None
    error: Optional[str] = None


class ImageEngine:
    """Tek instance'lı görsel üretim motoru. Singleton."""

    _instance: Optional["ImageEngine"] = None
    _instance_lock = threading.Lock()

    # 12 GB altı VRAM tespit edilirse cpu_offload zorunlu
    VRAM_OFFLOAD_THRESHOLD_GB = 12.0

    def __init__(self) -> None:
        self._pipe: Any = None
        self._status = ImageEngineStatus()
        self._gen_lock = threading.Lock()
        IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    @classmethod
    def get(cls) -> "ImageEngine":
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @property
    def is_ready(self) -> bool:
        return self._status.state in ("ready", "generating")

    @property
    def status(self) -> dict[str, Any]:
        s = self._status
        return {
            "state": s.state,
            "model_id": s.model_id,
            "pipeline": s.pipeline,
            "backend": s.backend,
            "cpu_offload": s.cpu_offload,
            "loaded_at": s.loaded_at,
            "error": s.error,
            "ready": self.is_ready,
        }

    # ---- VRAM tespiti ----

    @staticmethod
    def _detect_cuda_vram_gb() -> tuple[bool, float]:
        try:
            import torch  # type: ignore[import-not-found]
            if not torch.cuda.is_available():
                return False, 0.0
            props = torch.cuda.get_device_properties(0)
            return True, props.total_memory / (1024 ** 3)
        except Exception:
            return False, 0.0

    # ---- yükleme ----

    def load(self, model_id: str,
             force_cpu_offload: bool = False) -> None:
        registry = ModelRegistry.get()
        spec = registry.get_image_spec(model_id)
        if not spec:
            raise ValueError(f"Bilinmeyen image modeli: {model_id}")

        if not registry.is_image_downloaded(model_id):
            raise RuntimeError(
                f"Model henüz indirilmedi: {model_id}. "
                f"/api/models/{model_id}/download çağrısı yapın."
            )

        path = registry.image_dir_path(model_id)
        log.info("Image modeli yükleniyor: %s [%s]",
                 model_id, spec.pipeline)

        self._unload_internal()
        self._status = ImageEngineStatus(
            state="loading", model_id=model_id, pipeline=spec.pipeline,
        )

        try:
            # Lazy import
            import torch  # type: ignore[import-not-found]

            cuda_ok, vram_gb = self._detect_cuda_vram_gb()
            backend = "cuda" if cuda_ok else "cpu"
            cpu_offload = force_cpu_offload or (
                cuda_ok and vram_gb < self.VRAM_OFFLOAD_THRESHOLD_GB
            ) or spec.vram_gb > vram_gb

            dtype = torch.float16 if cuda_ok else torch.float32
            if spec.pipeline == "flux":
                dtype = torch.bfloat16 if cuda_ok else torch.float32

            self._pipe = self._build_pipeline(spec.pipeline, str(path), dtype)

            # GPU yerleşimi
            if cuda_ok:
                if cpu_offload:
                    self._pipe.enable_model_cpu_offload()
                else:
                    self._pipe.to("cuda")
                # OOM'u önlemek için VAE slicing
                if hasattr(self._pipe, "enable_vae_slicing"):
                    self._pipe.enable_vae_slicing()
                if hasattr(self._pipe, "enable_vae_tiling"):
                    self._pipe.enable_vae_tiling()

            self._status = ImageEngineStatus(
                state="ready",
                model_id=model_id,
                pipeline=spec.pipeline,
                backend=backend,
                cpu_offload=cpu_offload,
                loaded_at=time.time(),
            )
            log.info("Image motoru hazır: %s [%s, vram=%.1f GB, offload=%s]",
                     model_id, backend, vram_gb, cpu_offload)

        except Exception as exc:
            log.exception("Image yüklemesi başarısız: %s", exc)
            self._status = ImageEngineStatus(
                state="error", model_id=model_id,
                pipeline=spec.pipeline, error=str(exc),
            )
            raise

    @staticmethod
    def _build_pipeline(kind: str, path: str, dtype) -> Any:
        """Pipeline türüne göre uygun diffusers sınıfını seç."""
        if kind == "sdxl":
            from diffusers import StableDiffusionXLPipeline  # type: ignore[import-not-found]
            return StableDiffusionXLPipeline.from_pretrained(
                path, torch_dtype=dtype, use_safetensors=True,
                variant="fp16" if str(dtype).endswith("float16") else None,
            )
        elif kind == "sdxl-turbo":
            from diffusers import AutoPipelineForText2Image  # type: ignore[import-not-found]
            return AutoPipelineForText2Image.from_pretrained(
                path, torch_dtype=dtype, use_safetensors=True,
                variant="fp16" if str(dtype).endswith("float16") else None,
            )
        elif kind == "flux":
            from diffusers import FluxPipeline  # type: ignore[import-not-found]
            return FluxPipeline.from_pretrained(path, torch_dtype=dtype)
        else:
            raise ValueError(f"Desteklenmeyen pipeline: {kind}")

    def unload(self) -> None:
        with self._gen_lock:
            self._unload_internal()

    def _unload_internal(self) -> None:
        if self._pipe is not None:
            try:
                del self._pipe
            except Exception:
                pass
            self._pipe = None
        self._status = ImageEngineStatus()
        try:
            import gc
            gc.collect()
            try:
                import torch  # type: ignore[import-not-found]
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass
        except Exception:
            pass

    # ---- üretim ----

    def generate(self, req: GenerationRequest) -> dict[str, Any]:
        if not self.is_ready or self._pipe is None:
            raise RuntimeError("Image motoru yüklü değil.")

        with self._gen_lock:
            self._status.state = "generating"
            try:
                return self._run_generation(req)
            finally:
                self._status.state = "ready"

    def _run_generation(self, req: GenerationRequest) -> dict[str, Any]:
        import torch  # type: ignore[import-not-found]

        t0 = time.time()
        generator = None
        if req.seed is not None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            generator = torch.Generator(device=device).manual_seed(req.seed)

        # Pipeline türüne göre args
        kwargs: dict[str, Any] = {
            "prompt": req.prompt,
            "num_inference_steps": req.steps,
            "guidance_scale": req.guidance,
            "width": req.width,
            "height": req.height,
            "num_images_per_prompt": max(1, req.num_images),
        }
        # SDXL ve SDXL-turbo negative_prompt destekler; FLUX desteklemez
        pipeline_kind = self._status.pipeline
        if pipeline_kind != "flux" and req.negative_prompt:
            kwargs["negative_prompt"] = req.negative_prompt
        if generator is not None:
            kwargs["generator"] = generator

        log.info("Üretim başlıyor: %s adim, %dx%d, prompt=%r",
                 req.steps, req.width, req.height, req.prompt[:80])

        result = self._pipe(**kwargs)
        images = result.images
        elapsed_ms = int((time.time() - t0) * 1000)

        # Diske yaz, EXIF prompt+seed ekle
        out: list[dict[str, Any]] = []
        for i, img in enumerate(images):
            file_id = f"{int(time.time())}-{uuid.uuid4().hex[:8]}-{i}"
            path = IMAGES_DIR / f"{file_id}.png"
            self._save_with_metadata(img, path, req)
            out.append({
                "id": file_id,
                "path": str(path),
                "filename": path.name,
                "url": f"/outputs/images/{path.name}",
                "width": req.width,
                "height": req.height,
            })

        return {
            "model": self._status.model_id,
            "pipeline": pipeline_kind,
            "images": out,
            "timing_ms": elapsed_ms,
            "request": {
                "prompt": req.prompt,
                "negative_prompt": req.negative_prompt,
                "steps": req.steps,
                "guidance": req.guidance,
                "seed": req.seed,
            },
        }

    @staticmethod
    def _save_with_metadata(img, path: Path, req: GenerationRequest) -> None:
        """PNG'ye PIL metadata olarak prompt + parametreleri göm."""
        try:
            from PIL.PngImagePlugin import PngInfo
            meta = PngInfo()
            meta.add_text("prompt", req.prompt)
            if req.negative_prompt:
                meta.add_text("negative_prompt", req.negative_prompt)
            meta.add_text("parameters",
                          f"steps={req.steps}, guidance={req.guidance}, "
                          f"size={req.width}x{req.height}, "
                          f"seed={req.seed if req.seed is not None else 'random'}")
            meta.add_text("software", "CODEGA AI")
            img.save(path, "PNG", pnginfo=meta)
        except Exception:
            # Metadata fail ederse en azından kaydet
            img.save(path, "PNG")
