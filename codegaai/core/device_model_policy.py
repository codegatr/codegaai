"""
Device-aware model recommendation for CODEGA AI.

The goal is simple: pick a model that answers now instead of timing out.
Heavy models stay available, but automatic loading prefers the safest model
for the detected CPU/GPU/RAM profile.
"""

from __future__ import annotations

import platform
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class DeviceProfile:
    os_name: str
    arch: str
    ram_gb: float
    vram_gb: float
    backend: str
    gpu_name: str = ""


@dataclass(frozen=True)
class ModelRecommendation:
    model_id: str
    tier: str
    reason: str


def detect_device_profile() -> DeviceProfile:
    ram_gb = 8.0
    try:
        import psutil
        ram_gb = round(psutil.virtual_memory().total / (1024 ** 3), 1)
    except Exception:
        pass

    backend = "cpu"
    vram_gb = 0.0
    gpu_name = ""
    try:
        import torch
        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            backend = "cuda"
            vram_gb = round(props.total_memory / (1024 ** 3), 1)
            gpu_name = props.name
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            backend = "metal"
            gpu_name = "Apple Silicon GPU"
    except Exception:
        pass

    return DeviceProfile(
        os_name=platform.system(),
        arch=platform.machine().lower(),
        ram_gb=ram_gb,
        vram_gb=vram_gb,
        backend=backend,
        gpu_name=gpu_name,
    )


def _first_available(downloaded: set[str], candidates: Iterable[str]) -> str:
    for model_id in candidates:
        if model_id in downloaded:
            return model_id
    return ""


def recommend_llm_model(
    profile: DeviceProfile | None = None,
    downloaded_ids: set[str] | None = None,
    task: str = "chat",
) -> ModelRecommendation:
    profile = profile or detect_device_profile()
    downloaded = downloaded_ids or set()
    task = task.lower()

    # 24GB+ GPU / 64GB+ unified-memory machines can use MoE class models.
    if (profile.vram_gb >= 20 or profile.ram_gb >= 64) and task in {"code", "reasoning", "agent"}:
        model_id = _first_available(downloaded, (
            "qwen3-coder-30b-a3b-q4_k_m",
            "qwen3-30b-a3b-q4_k_m",
            "qwen3-next-80b-a3b-instruct-q4_k_m",
            "qwen3-8b-q4_k_m",
            "qwen3-4b-q4_k_m",
        ))
        if model_id:
            return ModelRecommendation(model_id, "workstation", "24 GB+ GPU veya 64 GB+ RAM ile büyük MoE modeli uygun.")

    # Apple Silicon shares unified memory; 24GB+ Macs can comfortably start at 8B.
    if profile.backend == "metal" or (profile.os_name == "Darwin" and profile.arch == "arm64"):
        if profile.ram_gb >= 24:
            model_id = _first_available(downloaded, ("qwen3-8b-q4_k_m", "qwen3-4b-q4_k_m"))
            if model_id:
                return ModelRecommendation(model_id, "strong", f"Apple Silicon {profile.ram_gb:g} GB unified memory için dengeli seçim.")
        model_id = _first_available(downloaded, ("qwen3-4b-q4_k_m", "qwen2.5-3b-instruct-q4_k_m"))
        if model_id:
            return ModelRecommendation(model_id, "balanced", "Apple Silicon düşük/orta bellek için hızlı başlangıç modeli.")

    # 6GB GPUs frequently time out with 8B during first load; prefer 4B.
    if profile.vram_gb < 8:
        model_id = _first_available(downloaded, ("qwen3-4b-q4_k_m", "qwen2.5-3b-instruct-q4_k_m"))
        if model_id:
            return ModelRecommendation(model_id, "balanced", f"{profile.vram_gb:g} GB VRAM ile zaman aşımını önleyen hızlı model.")

    if profile.vram_gb >= 8 or profile.ram_gb >= 32:
        model_id = _first_available(downloaded, ("qwen3-8b-q4_k_m", "qwen3-4b-q4_k_m", "qwen2.5-3b-instruct-q4_k_m"))
        if model_id:
            return ModelRecommendation(model_id, "strong", "8 GB+ VRAM veya 32 GB+ RAM için güçlü yerel model.")

    model_id = _first_available(downloaded, (
        "qwen3-4b-q4_k_m",
        "qwen2.5-3b-instruct-q4_k_m",
        "qwen3-8b-q4_k_m",
    ))
    if model_id:
        return ModelRecommendation(model_id, "balanced", "İndirilen modeller arasından en güvenli varsayılan seçildi.")

    return ModelRecommendation("qwen3-4b-q4_k_m", "recommended_download", "Bu cihaz için ilk indirilmesi önerilen model.")
