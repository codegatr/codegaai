"""Video üretim uç noktaları (Faz 6 stub)."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()


class VideoRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    duration_seconds: int = Field(4, ge=1, le=10)
    fps: int = Field(8, ge=4, le=30)
    width: int = Field(720, ge=256, le=1280)
    height: int = Field(480, ge=256, le=1280)
    model: str = "cogvideox-2b"


@router.post("")
async def generate(req: VideoRequest) -> dict:
    return {
        "status": "stub",
        "message": "Video üretimi Faz 6'da (v0.6.0) aktif olacak.",
        "planned_models": ["CogVideoX-2B", "AnimateDiff (SDXL ile)"],
        "received_prompt": req.prompt[:100],
    }


@router.get("/models")
async def list_models() -> dict:
    return {
        "loaded": [],
        "available_for_download": [
            {
                "id": "cogvideox-2b",
                "name": "CogVideoX 2B",
                "size_gb": 9.2,
                "vram_gb": 8.0,
                "default": True,
                "note": "RTX 3060 12GB için optimize",
            },
        ],
    }


@router.get("/status")
async def status() -> dict:
    return {"active": False, "phase": "Faz 2", "expected_in": "Faz 6 (v0.6.0)"}
