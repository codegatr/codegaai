"""
Device-aware model recommendation for CODEGA AI.

The policy is intentionally conservative: local chat must answer quickly.
Heavy models stay available for explicit deep work, but short/chat tasks use
the fastest reliable local model first.
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

        ram_gb = round(psutil.virtual_memory().total / (1024**3), 1)
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
            vram_gb = round(props.total_memory / (1024**3), 1)
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


FAST_CHAT_TASKS = {
    "fast_response",
    "short_qa",
    "chat",
    "general",
    "calculation",
    "translate",
    "social",
    "ack",
    "direct_output",
    "capability",
    "factual",
}

STRONG_TASKS = {
    "coding",
    "code",
    "analysis",
    "architecture",
    "architecture_planning",
    "reasoning",
    "agent",
}

FAST_MODEL_ORDER = (
    "qwen3-4b-q4_k_m",
    "qwen2.5-3b-instruct-q4_k_m",
)

STRONG_MODEL_ORDER = (
    "qwen3-8b-q4_k_m",
    "qwen3-4b-q4_k_m",
    "qwen2.5-3b-instruct-q4_k_m",
)


def recommend_llm_model(
    profile: DeviceProfile | None = None,
    downloaded_ids: set[str] | None = None,
    task: str = "chat",
    allow_large: bool = False,
) -> ModelRecommendation:
    profile = profile or detect_device_profile()
    downloaded = downloaded_ids or set()
    task = (task or "chat").lower()

    if task in FAST_CHAT_TASKS:
        model_id = _first_available(downloaded, FAST_MODEL_ORDER)
        if model_id:
            return ModelRecommendation(
                model_id,
                "fast",
                "Kisa sohbet ve hizli cevap gorevleri icin 4B varsayilan secildi.",
            )
        return ModelRecommendation(
            "qwen3-4b-q4_k_m",
            "recommended_download",
            "Kisa sohbet ve hizli cevaplar icin once 4B model kurulmalidir.",
        )

    if allow_large and (profile.vram_gb >= 20 or profile.ram_gb >= 64) and task in {"code", "coding", "reasoning", "agent"}:
        model_id = _first_available(
            downloaded,
            (
                "qwen3-coder-30b-a3b-q4_k_m",
                "qwen3-30b-a3b-q4_k_m",
                "qwen3-next-80b-a3b-instruct-q4_k_m",
                "qwen3-8b-q4_k_m",
                "qwen3-4b-q4_k_m",
            ),
        )
        if model_id:
            return ModelRecommendation(model_id, "workstation", "Buyuk MoE modeli icin donanim ve kullanici izni uygun.")

    if task in STRONG_TASKS and allow_large and (profile.vram_gb >= 10 or profile.ram_gb >= 48):
        model_id = _first_available(downloaded, STRONG_MODEL_ORDER)
        if model_id:
            return ModelRecommendation(model_id, "strong", "Guclu model icin donanim ve kullanici izni uygun.")

    if (profile.backend == "metal" or (profile.os_name == "Darwin" and profile.arch == "arm64")) and allow_large and profile.ram_gb >= 24:
        model_id = _first_available(downloaded, STRONG_MODEL_ORDER)
        if model_id:
            return ModelRecommendation(model_id, "strong", "Apple Silicon icin guclu model kullanici izniyle secildi.")

    if task in STRONG_TASKS:
        model_id = _first_available(downloaded, FAST_MODEL_ORDER)
        if model_id:
            return ModelRecommendation(
                model_id,
                "balanced",
                "Guclu model otomatik secilmedi; daha dusuk gecikme icin 4B kullanildi.",
            )

    if profile.backend == "metal" or (profile.os_name == "Darwin" and profile.arch == "arm64"):
        model_id = _first_available(downloaded, FAST_MODEL_ORDER)
        if model_id:
            return ModelRecommendation(model_id, "fast", "Apple Silicon icin hizli varsayilan 4B secildi.")

    if profile.vram_gb < 8:
        model_id = _first_available(downloaded, FAST_MODEL_ORDER)
        if model_id:
            return ModelRecommendation(model_id, "fast", f"{profile.vram_gb:g} GB VRAM icin 4B hizli model secildi.")

    if allow_large and (profile.vram_gb >= 10 or profile.ram_gb >= 48):
        model_id = _first_available(downloaded, STRONG_MODEL_ORDER)
        if model_id:
            return ModelRecommendation(model_id, "strong", "10 GB+ VRAM veya 48 GB+ RAM icin guclu model secildi.")

    model_id = _first_available(downloaded, FAST_MODEL_ORDER)
    if model_id:
        return ModelRecommendation(model_id, "fast", "Indirilen modeller arasindan hizli varsayilan secildi.")

    return ModelRecommendation("qwen3-4b-q4_k_m", "recommended_download", "Bu cihaz icin ilk indirilmesi onerilen model.")
