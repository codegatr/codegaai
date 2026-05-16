"""
codegaai.api.routes.gpu
=========================

Faz 32 — GPU Hızlandırma

GET  /api/gpu/status      — GPU durumu (CUDA/ROCm/MPS)
POST /api/gpu/enable      — GPU ile modeli yeniden yükle
GET  /api/gpu/benchmark   — Hız testi (token/sn)
GET  /api/gpu/vram        — VRAM kullanımı
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


def _detect_gpu() -> dict:
    """Mevcut GPU ve CUDA durumunu tespit et."""
    result = {
        "cuda_available": False,
        "cuda_version": None,
        "gpu_name": None,
        "vram_total_mb": 0,
        "vram_free_mb": 0,
        "driver_version": None,
        "backend": "cpu",
        "llama_cpp_gpu": False,
    }

    try:
        import torch
        result["cuda_available"] = torch.cuda.is_available()
        if torch.cuda.is_available():
            result["cuda_version"] = torch.version.cuda
            result["gpu_name"] = torch.cuda.get_device_name(0)
            mem = torch.cuda.mem_get_info(0)
            result["vram_free_mb"] = int(mem[0] / 1024 / 1024)
            result["vram_total_mb"] = int(mem[1] / 1024 / 1024)
            result["backend"] = "cuda"
    except Exception:
        pass

    # MPS (Apple Silicon)
    try:
        import torch
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            result["backend"] = "mps"
    except Exception:
        pass

    # nvidia-smi ile driver versiyon
    try:
        import subprocess, sys
        # nvidia-smi yalnızca Windows ve Linux'ta çalıştır, frozen build'de kısa timeout
        timeout = 2 if getattr(sys, "frozen", False) else 3
        r = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,driver_version,memory.total,memory.free",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=timeout,
            creationflags=0x08000000 if sys.platform == "win32" else 0,  # CREATE_NO_WINDOW
        )
        if r.returncode == 0:
            parts = r.stdout.strip().split(",")
            if len(parts) >= 4:
                result["gpu_name"] = parts[0].strip()
                result["driver_version"] = parts[1].strip()
                result["vram_total_mb"] = int(parts[2].strip())
                result["vram_free_mb"] = int(parts[3].strip())
    except Exception:
        pass

    # llama.cpp GPU desteği var mı?
    try:
        from llama_cpp import Llama
        result["llama_cpp_gpu"] = hasattr(Llama, "n_gpu_layers")
    except Exception:
        pass

    return result


@router.get("/status")
async def gpu_status() -> dict:
    gpu = _detect_gpu()

    # Mevcut model katman sayısı
    try:
        from codegaai.core.engine import LLMEngine
        st = LLMEngine.get().status
        gpu["current_gpu_layers"] = st.get("n_gpu_layers", 0)
        gpu["current_model"] = st.get("model_id")
    except Exception:
        gpu["current_gpu_layers"] = 0

    # Öneri
    if gpu["cuda_available"] and gpu["vram_total_mb"] >= 4000:
        vram = gpu["vram_total_mb"]
        if vram >= 8000:
            gpu["recommendation"] = "Qwen 7B tam GPU'da çalışır (n_gpu_layers=99)"
        elif vram >= 6000:
            gpu["recommendation"] = "Qwen 7B kısmi GPU (n_gpu_layers=20-30 önerilir)"
        elif vram >= 4000:
            gpu["recommendation"] = "Qwen 3B tam GPU'da çalışır (n_gpu_layers=99)"
        else:
            gpu["recommendation"] = "Az VRAM — hibrit mod önerilir (n_gpu_layers=8-16)"
    elif gpu["cuda_available"]:
        gpu["recommendation"] = "CUDA var ama VRAM yetersiz — CPU modu kullan"
    else:
        gpu["recommendation"] = "CUDA yok — CPU modunda çalışıyorsunuz"

    return gpu


class EnableGPURequest(BaseModel):
    n_gpu_layers: int = 20    # Kaç katman GPU'ya taşınsın
    model_id: str = ""        # Boş → mevcut model


@router.post("/enable")
async def enable_gpu(req: EnableGPURequest) -> dict:
    """GPU ile modeli yeniden yükle."""
    gpu = _detect_gpu()
    if not gpu["cuda_available"]:
        return {"error": "CUDA bulunamadı. NVIDIA GPU ve CUDA driver gerekli."}

    if not gpu["llama_cpp_gpu"]:
        return {
            "error": "llama-cpp-python CUDA build'i gerekli",
            "install": "pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu124",
        }

    try:
        from codegaai.core.engine import LLMEngine
        from codegaai.core.models_registry import ModelRegistry

        engine = LLMEngine.get()
        reg = ModelRegistry.get()

        model_id = req.model_id or engine.status.get("model_id", "")
        if not model_id:
            return {"error": "Model seçilmemiş"}

        # GPU katmanı ile yeniden yükle
        result = engine.load(model_id, n_gpu_layers=req.n_gpu_layers)
        return {
            "ok": True,
            "model_id": model_id,
            "n_gpu_layers": req.n_gpu_layers,
            "backend": "cuda",
            "message": f"{req.n_gpu_layers} katman GPU'ya taşındı",
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/benchmark")
async def benchmark() -> dict:
    """Mevcut modelin hız testi (token/saniye)."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    import time
    msgs = [
        {"role": "system", "content": "Kısa cevap ver."},
        {"role": "user", "content": "1'den 20'ye kadar say."},
    ]
    t0 = time.time()
    token_count = 0
    for _ in engine.stream(msgs, cfg=GenerationConfig(max_tokens=50, temperature=0.1)):
        token_count += 1
    elapsed = time.time() - t0

    return {
        "tokens": token_count,
        "elapsed_s": round(elapsed, 2),
        "tokens_per_second": round(token_count / max(elapsed, 0.001), 1),
        "model_id": engine.status.get("model_id"),
        "backend": _detect_gpu()["backend"],
    }


@router.get("/vram")
async def vram_usage() -> dict:
    """Anlık VRAM kullanımı."""
    try:
        import torch
        if torch.cuda.is_available():
            allocated = torch.cuda.memory_allocated(0) / 1024 / 1024
            reserved = torch.cuda.memory_reserved(0) / 1024 / 1024
            total = torch.cuda.get_device_properties(0).total_memory / 1024 / 1024
            return {
                "allocated_mb": round(allocated),
                "reserved_mb": round(reserved),
                "total_mb": round(total),
                "free_mb": round(total - reserved),
                "usage_pct": round(reserved / total * 100, 1),
            }
    except Exception:
        pass
    return {"error": "CUDA mevcut değil"}
