"""
codegaai.core.vision_engine
=============================

Faz 11 - Görüntü ve Video Anlama.

Desteklenen modeller:
  1. moondream2 (varsayılan) — 1.8 GB VRAM, hızlı, Türkçe OK
     vikhyatk/moondream2 — transformers, trust_remote_code
  2. LLaVA 1.5 7B Q4_K_M — 5.5 GB VRAM, kaliteli
     mys/ggml_llava-v1.5-7b (GGUF, llama-cpp-python)
  3. Qwen2-VL 2B — 2 GB VRAM, Türkçe güçlü
     Qwen/Qwen2-VL-2B-Instruct

6 GB VRAM öneri:
  Qwen 3B (2.5 GB) + moondream2 (1.8 GB) = 4.3 GB → rahat çalışır
  Qwen 7B (5.5 GB) + moondream2 = 7.3 GB → zor (model sıraya al)

Kullanım:
    engine = VisionEngine.get()
    engine.load("moondream2")
    result = engine.analyze(image_path="foto.jpg", question="Ne görüyorsun?")
    result = engine.analyze(image_bytes=b"...", question="Bu belgede ne yazıyor?")
"""

from __future__ import annotations

import base64
import io
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from codegaai.config import DATA_DIR, MODELS_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)

VISION_MODELS_DIR = MODELS_DIR / "vision"
VISION_MODELS_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class VisionModelSpec:
    id: str
    name: str
    hf_repo: str
    size_gb: float
    vram_gb: float
    description: str
    backend: str = "transformers"  # transformers | llamacpp
    hf_file: Optional[str] = None
    trust_remote_code: bool = False
    default: bool = False


VISION_MODELS: tuple[VisionModelSpec, ...] = (
    VisionModelSpec(
        id="moondream2",
        name="Moondream 2 ⚡ Hızlı",
        hf_repo="vikhyatk/moondream2",
        size_gb=1.8,
        vram_gb=1.8,
        description="1.8 GB VRAM. Qwen ile birlikte çalışır. Hızlı, pratik.",
        backend="transformers",
        trust_remote_code=True,
        default=True,
    ),
    VisionModelSpec(
        id="qwen2-vl-2b",
        name="Qwen2-VL 2B",
        hf_repo="Qwen/Qwen2-VL-2B-Instruct",
        size_gb=2.0,
        vram_gb=2.2,
        description="2 GB VRAM. Türkçe güçlü, Qwen ailesi.",
        backend="transformers",
    ),
    VisionModelSpec(
        id="llava-phi3-mini",
        name="LLaVA-Phi-3 Mini",
        hf_repo="xtuner/llava-phi-3-mini-hf",
        size_gb=3.8,
        vram_gb=4.0,
        description="4 GB VRAM. Phi-3 temelli, denge modeli.",
        backend="transformers",
    ),
)

VISION_MODEL_MAP = {m.id: m for m in VISION_MODELS}


@dataclass
class VisionStatus:
    state: str = "idle"   # idle | loading | ready | error
    model_id: Optional[str] = None
    vram_gb: float = 0.0
    loaded_at: Optional[float] = None
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "state": self.state,
            "model_id": self.model_id,
            "vram_gb": self.vram_gb,
            "loaded_at": self.loaded_at,
            "error": self.error,
            "ready": self.state == "ready",
        }


class VisionEngine:
    """Multimodal görüntü anlama motoru. Singleton."""

    _instance: Optional["VisionEngine"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._model = None
        self._processor = None
        self._tokenizer = None
        self._status = VisionStatus()
        self._gen_lock = threading.Lock()

    @classmethod
    def get(cls) -> "VisionEngine":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @property
    def is_ready(self) -> bool:
        return self._status.state == "ready"

    @property
    def status(self) -> dict:
        return self._status.to_dict()

    # ============================================================
    # Yükleme
    # ============================================================

    def load(self, model_id: str = "moondream2") -> None:
        spec = VISION_MODEL_MAP.get(model_id)
        if not spec:
            raise ValueError(f"Bilinmeyen vision modeli: {model_id}")

        if self.is_ready and self._status.model_id == model_id:
            return

        self._status = VisionStatus(state="loading", model_id=model_id)
        log.info("Vision modeli yükleniyor: %s", model_id)

        try:
            if spec.backend == "transformers":
                self._load_transformers(spec)
            else:
                raise ValueError(f"Desteklenmeyen backend: {spec.backend}")

            self._status = VisionStatus(
                state="ready",
                model_id=model_id,
                vram_gb=spec.vram_gb,
                loaded_at=time.time(),
            )
            log.info("Vision hazır: %s", model_id)

        except Exception as exc:
            log.exception("Vision yükleme hatası: %s", exc)
            self._status = VisionStatus(state="error", error=str(exc))
            raise

    def _load_transformers(self, spec: VisionModelSpec) -> None:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer  # type: ignore

        cache_dir = str(DATA_DIR / "cache" / "huggingface")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32

        log.info("  Device: %s, dtype: %s", device, dtype)

        # Revision sabitler — moondream2 çok hızlı güncelleniyor
        kwargs: dict[str, Any] = dict(
            cache_dir=cache_dir,
            trust_remote_code=spec.trust_remote_code,
            torch_dtype=dtype,
        )
        if device == "cuda":
            kwargs["device_map"] = "auto"

        if spec.id == "moondream2":
            # moondream2: pyvips gerektirmeyen kararlı revision
            # 2024-08-26 revision'ı pyvips bağımlılığı içermiyor
            MOONDREAM_REVISION = "2024-08-26"
            try:
                self._model = AutoModelForCausalLM.from_pretrained(
                    spec.hf_repo,
                    revision=MOONDREAM_REVISION,
                    **kwargs,
                ).eval()
                self._tokenizer = AutoTokenizer.from_pretrained(
                    spec.hf_repo,
                    revision=MOONDREAM_REVISION,
                    cache_dir=cache_dir,
                )
            except Exception as e:
                # Revision başarısız → pyvips'siz en son deneme
                log.warning("moondream2 revision %s başarısız: %s, "
                            "pyvips olmadan denenecek", MOONDREAM_REVISION, e)
                # pyvips import'unu engelle
                import sys
                sys.modules["pyvips"] = type(sys)("pyvips_stub")
                self._model = AutoModelForCausalLM.from_pretrained(
                    spec.hf_repo, **kwargs,
                ).eval()
                self._tokenizer = AutoTokenizer.from_pretrained(
                    spec.hf_repo, cache_dir=cache_dir,
                )
            self._processor = None

        elif "Qwen2-VL" in spec.hf_repo:
            from transformers import Qwen2VLForConditionalGeneration, AutoProcessor  # type: ignore
            self._model = Qwen2VLForConditionalGeneration.from_pretrained(
                spec.hf_repo, **kwargs
            ).eval()
            self._processor = AutoProcessor.from_pretrained(
                spec.hf_repo, cache_dir=cache_dir,
            )
            self._tokenizer = None

        else:
            # Genel LLaVA tarzı
            from transformers import LlavaForConditionalGeneration, AutoProcessor  # type: ignore
            self._model = LlavaForConditionalGeneration.from_pretrained(
                spec.hf_repo, **kwargs
            ).eval()
            self._processor = AutoProcessor.from_pretrained(
                spec.hf_repo, cache_dir=cache_dir,
            )
            self._tokenizer = None

        if device == "cpu" or not hasattr(self._model, "device_map"):
            self._model = self._model.to(device)

    def unload(self) -> None:
        import gc
        self._model = None
        self._processor = None
        self._tokenizer = None
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        gc.collect()
        self._status = VisionStatus()
        log.info("Vision modeli bellekten çıkarıldı")

    # ============================================================
    # Analiz
    # ============================================================

    def analyze(
        self,
        question: str,
        image_path: Optional[str] = None,
        image_bytes: Optional[bytes] = None,
        image_b64: Optional[str] = None,
        max_tokens: int = 512,
    ) -> str:
        """
        Görüntüyü analiz et ve soruyu yanıtla.

        Görüntü kaynağı (biri zorunlu):
            image_path  — dosya yolu
            image_bytes — ham bayt
            image_b64   — base64 encoded

        Dönüş: model yanıtı (string)
        """
        if not self.is_ready:
            raise RuntimeError("Vision modeli yüklü değil")

        # Görüntüyü yükle
        from PIL import Image  # type: ignore

        if image_path:
            img = Image.open(image_path).convert("RGB")
        elif image_bytes:
            img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        elif image_b64:
            raw = base64.b64decode(image_b64)
            img = Image.open(io.BytesIO(raw)).convert("RGB")
        else:
            raise ValueError("Görüntü kaynağı belirtilmedi")

        # Boyutu sınırla (bellek tasarrufu)
        img.thumbnail((1024, 1024), Image.LANCZOS)

        with self._gen_lock:
            return self._run_inference(img, question, max_tokens)

    def _run_inference(self, img, question: str, max_tokens: int) -> str:
        import torch
        model_id = self._status.model_id

        with torch.no_grad():
            if model_id == "moondream2":
                return self._infer_moondream(img, question, max_tokens)
            elif "qwen2-vl" in (model_id or ""):
                return self._infer_qwen_vl(img, question, max_tokens)
            else:
                return self._infer_llava(img, question, max_tokens)

    def _infer_moondream(self, img, question: str, max_tokens: int) -> str:
        enc = self._model.encode_image(img)
        return self._model.answer_question(enc, question, self._tokenizer)

    def _infer_qwen_vl(self, img, question: str, max_tokens: int) -> str:
        import torch
        messages = [{"role": "user", "content": [
            {"type": "image", "image": img},
            {"type": "text", "text": question},
        ]}]
        text = self._processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True,
        )
        inputs = self._processor(
            text=[text], images=[img], return_tensors="pt",
        ).to(self._model.device)
        with torch.no_grad():
            out = self._model.generate(**inputs, max_new_tokens=max_tokens)
        generated = out[0][inputs.input_ids.shape[1]:]
        return self._processor.decode(generated, skip_special_tokens=True)

    def _infer_llava(self, img, question: str, max_tokens: int) -> str:
        import torch
        prompt = f"USER: <image>\n{question}\nASSISTANT:"
        inputs = self._processor(
            text=prompt, images=img, return_tensors="pt",
        ).to(self._model.device)
        with torch.no_grad():
            out = self._model.generate(**inputs, max_new_tokens=max_tokens)
        return self._processor.decode(out[0][2:], skip_special_tokens=True)

    # ============================================================
    # Toplu analiz (video frame'leri için)
    # ============================================================

    def analyze_frames(
        self,
        frames: list[bytes],
        questions: list[str] | str,
        max_tokens: int = 256,
    ) -> list[str]:
        """Birden fazla frame'i analiz et."""
        if isinstance(questions, str):
            questions = [questions] * len(frames)

        results = []
        for i, (frame_bytes, q) in enumerate(zip(frames, questions)):
            try:
                result = self.analyze(
                    question=q,
                    image_bytes=frame_bytes,
                    max_tokens=max_tokens,
                )
                results.append(result)
            except Exception as exc:
                results.append(f"[Frame {i}: Hata — {exc}]")

        return results
