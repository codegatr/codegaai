"""Görsel üretim uç noktaları (Faz 4 stub)."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()


class ImageRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    negative_prompt: str = ""
    width: int = Field(1024, ge=256, le=2048)
    height: int = Field(1024, ge=256, le=2048)
    steps: int = Field(28, ge=1, le=100)
    guidance: float = Field(7.0, ge=0.0, le=20.0)
    seed: int = -1
    model: str = "stable-diffusion-xl-base-1.0"


@router.post("")
async def generate(req: ImageRequest) -> dict:
    return {
        "status": "stub",
        "message": "Görsel üretimi Faz 4'te (v0.4.0) aktif olacak.",
        "planned_models": ["SDXL", "FLUX.1-schnell", "SDXL-Turbo"],
        "received_prompt": req.prompt[:100],
    }


@router.get("/models")
async def list_models() -> dict:
    return {
        "loaded": [],
        "available_for_download": [
            {
                "id": "stable-diffusion-xl-base-1.0",
                "name": "Stable Diffusion XL 1.0",
                "size_gb": 6.6,
                "vram_gb": 8.0,
                "default": True,
            },
            {
                "id": "flux.1-schnell",
                "name": "FLUX.1 schnell",
                "size_gb": 23.8,
                "vram_gb": 12.0,
                "note": "En yüksek kalite, 4 adımda üretir",
            },
            {
                "id": "sdxl-turbo",
                "name": "SDXL Turbo",
                "size_gb": 6.9,
                "vram_gb": 8.0,
                "note": "Tek adımda üretim, hız öncelikli",
            },
        ],
    }


@router.get("/status")
async def status() -> dict:
    return {"active": False, "phase": "Faz 2", "expected_in": "Faz 4 (v0.4.0)"}
