"""
codegaai.core.video_engine
============================

Video üretim motoru — diffusers tabanlı.

2 pipeline türü:
- **cogvideox**: text-to-video (THUDM CogVideoX-2B/5B)
- **svd**: image-to-video (Stable Video Diffusion)

12 GB altı VRAM için cpu_offload otomatik aktif. CogVideoX-5B
büyük olduğundan 12 GB'da yavaş ama çalışır.

Kullanım:

    eng = VideoEngine.get()
    eng.load("cogvideox-2b")
    out = eng.generate(VideoRequest(
        prompt="bir astronot Mars'ta yürüyor",
        steps=50, frames=49, fps=8,
    ))
"""

from __future__ import annotations

import os
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

VIDEOS_DIR = OUTPUTS_DIR / "videos"


@dataclass
class VideoRequest:
    prompt: str
    negative_prompt: str = ""
    steps: int = 50
    guidance: float = 6.0
    frames: int = 49
    fps: int = 8
    width: int = 720
    height: int = 480
    seed: Optional[int] = None
    image_path: Optional[str] = None   # i2v için


@dataclass
class VideoEngineStatus:
    state: str = "unloaded"
    model_id: Optional[str] = None
    pipeline: Optional[str] = None
    mode: Optional[str] = None
    backend: Optional[str] = None
    cpu_offload: bool = False
    loaded_at: Optional[float] = None
    error: Optional[str] = None


class VideoEngine:
    """Tek instance'lı video motoru. Singleton."""

    _instance: Optional["VideoEngine"] = None
    _instance_lock = threading.Lock()

    VRAM_OFFLOAD_THRESHOLD_GB = 16.0  # video için yüksek tut

    def __init__(self) -> None:
        self._pipe: Any = None
        self._status = VideoEngineStatus()
        self._gen_lock = threading.Lock()
        VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

    @classmethod
    def get(cls) -> "VideoEngine":
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
            "mode": s.mode,
            "backend": s.backend,
            "cpu_offload": s.cpu_offload,
            "loaded_at": s.loaded_at,
            "error": s.error,
            "ready": self.is_ready,
        }

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

    def load(self, model_id: str,
             force_cpu_offload: bool = False) -> None:
        registry = ModelRegistry.get()
        spec = registry.get_video_spec(model_id)
        if not spec:
            raise ValueError(f"Bilinmeyen video modeli: {model_id}")

        if not registry.is_video_downloaded(model_id):
            raise RuntimeError(
                f"Model henüz indirilmedi: {model_id}. "
                f"/api/models/{model_id}/download çağrısı yapın."
            )

        path = registry.video_dir_path(model_id)
        log.info("Video modeli yükleniyor: %s [%s]",
                 model_id, spec.pipeline)

        self._unload_internal()
        self._status = VideoEngineStatus(
            state="loading", model_id=model_id,
            pipeline=spec.pipeline, mode=spec.mode,
        )

        try:
            import torch  # type: ignore[import-not-found]
            cuda_ok, vram_gb = self._detect_cuda_vram_gb()
            if not cuda_ok and os.environ.get("CODEGA_ALLOW_CPU_DIFFUSERS", "").strip() != "1":
                raise RuntimeError(
                    "Video uretim modeli CPU modunda ana uygulamayi kapatabilecek kadar agir. "
                    "Guvenlik icin CPU diffusers yuklemesi engellendi. CUDA destekli paket kullanin."
                )
            if cuda_ok and spec.vram_gb > vram_gb and os.environ.get("CODEGA_ALLOW_LOW_VRAM_DIFFUSERS", "").strip() != "1":
                raise RuntimeError(
                    f"Video uretim modeli icin en az {spec.vram_gb:.1f} GB VRAM gerekir; "
                    f"bu GPU {vram_gb:.1f} GB gorunuyor. Uygulamanin kapanmamasi icin yukleme engellendi. "
                    "Daha kucuk model kullanin veya CODEGA_ALLOW_LOW_VRAM_DIFFUSERS=1 ile riski kendiniz acin."
                )
            backend = "cuda" if cuda_ok else "cpu"
            cpu_offload = force_cpu_offload or (
                cuda_ok and vram_gb < self.VRAM_OFFLOAD_THRESHOLD_GB
            ) or spec.vram_gb > vram_gb

            dtype = torch.bfloat16 if cuda_ok else torch.float32

            self._pipe = self._build_pipeline(spec.pipeline, str(path), dtype)

            if cuda_ok:
                if cpu_offload:
                    self._pipe.enable_model_cpu_offload()
                else:
                    self._pipe.to("cuda")
                if hasattr(self._pipe, "enable_vae_slicing"):
                    self._pipe.enable_vae_slicing()
                if hasattr(self._pipe, "enable_vae_tiling"):
                    self._pipe.enable_vae_tiling()

            self._status = VideoEngineStatus(
                state="ready",
                model_id=model_id,
                pipeline=spec.pipeline,
                mode=spec.mode,
                backend=backend,
                cpu_offload=cpu_offload,
                loaded_at=time.time(),
            )
            log.info("Video motoru hazır: %s [%s, vram=%.1f, offload=%s]",
                     model_id, backend, vram_gb, cpu_offload)

        except Exception as exc:
            log.exception("Video yüklemesi başarısız: %s", exc)
            self._status = VideoEngineStatus(
                state="error", model_id=model_id, error=str(exc),
            )
            raise

    @staticmethod
    def _build_pipeline(kind: str, path: str, dtype) -> Any:
        if kind == "cogvideox":
            from diffusers import CogVideoXPipeline  # type: ignore[import-not-found]
            return CogVideoXPipeline.from_pretrained(path, torch_dtype=dtype)
        elif kind == "svd":
            from diffusers import StableVideoDiffusionPipeline  # type: ignore[import-not-found]
            return StableVideoDiffusionPipeline.from_pretrained(
                path, torch_dtype=dtype, variant="fp16",
            )
        else:
            raise ValueError(f"Desteklenmeyen video pipeline: {kind}")

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
        self._status = VideoEngineStatus()
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

    def generate(self, req: VideoRequest) -> dict[str, Any]:
        if not self.is_ready or self._pipe is None:
            raise RuntimeError("Video motoru yüklü değil.")

        with self._gen_lock:
            self._status.state = "generating"
            try:
                return self._run_generation(req)
            finally:
                self._status.state = "ready"

    def _run_generation(self, req: VideoRequest) -> dict[str, Any]:
        import torch  # type: ignore[import-not-found]
        from diffusers.utils import export_to_video  # type: ignore[import-not-found]

        t0 = time.time()
        generator = None
        if req.seed is not None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            generator = torch.Generator(device=device).manual_seed(req.seed)

        kwargs: dict[str, Any] = {
            "num_inference_steps": req.steps,
            "guidance_scale": req.guidance,
            "num_frames": req.frames,
        }
        if generator is not None:
            kwargs["generator"] = generator

        # Pipeline türüne göre input
        if self._status.mode == "i2v":
            if not req.image_path:
                raise ValueError("i2v için image_path gerekli")
            from PIL import Image
            img = Image.open(req.image_path).convert("RGB")
            kwargs["image"] = img
        else:
            kwargs["prompt"] = req.prompt
            kwargs["height"] = req.height
            kwargs["width"] = req.width
            if req.negative_prompt:
                kwargs["negative_prompt"] = req.negative_prompt

        log.info("Video üretim başladı: %d kare, %dx%d, prompt=%r",
                 req.frames, req.width, req.height, req.prompt[:80])

        result = self._pipe(**kwargs)
        frames_list = result.frames[0]
        elapsed_ms = int((time.time() - t0) * 1000)

        # Diske MP4 olarak yaz
        file_id = f"{int(time.time())}-{uuid.uuid4().hex[:8]}"
        out_path = VIDEOS_DIR / f"{file_id}.mp4"
        export_to_video(frames_list, str(out_path), fps=req.fps)

        return {
            "id": file_id,
            "path": str(out_path),
            "filename": out_path.name,
            "url": f"/outputs/videos/{out_path.name}",
            "frames": len(frames_list),
            "fps": req.fps,
            "duration_sec": round(len(frames_list) / req.fps, 2),
            "size_bytes": out_path.stat().st_size,
            "model": self._status.model_id,
            "pipeline": self._status.pipeline,
            "timing_ms": elapsed_ms,
            "request": {
                "prompt": req.prompt,
                "steps": req.steps,
                "guidance": req.guidance,
                "seed": req.seed,
            },
        }
