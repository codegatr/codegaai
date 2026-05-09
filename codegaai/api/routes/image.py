"""
Görsel üretim uç noktaları (Faz 4).

POST /api/image/generate   — prompt'tan görsel üret
GET  /api/image/list       — daha önce üretilen görselleri listele
GET  /api/image/status     — motor durumu
"""

from __future__ import annotations

from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from codegaai.config import OUTPUTS_DIR
from codegaai.core.image_engine import (
    GenerationRequest,
    ImageEngine,
    IMAGES_DIR,
)
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    negative_prompt: str = Field("", max_length=1000)
    steps: int = Field(30, ge=1, le=150)
    guidance: float = Field(7.5, ge=0.0, le=20.0)
    width: int = Field(1024, ge=256, le=2048)
    height: int = Field(1024, ge=256, le=2048)
    seed: Optional[int] = Field(None, ge=0, le=2**32 - 1)
    num_images: int = Field(1, ge=1, le=4)


@router.post("/generate")
async def generate(req: GenerateRequest) -> dict:
    eng = ImageEngine.get()
    if not eng.is_ready:
        raise HTTPException(
            409,
            "Image motoru yüklü değil. Sistem → Görsel Modelleri'nden "
            "bir model indir ve yükle (örn. SDXL Base 1.0)."
        )

    try:
        result = eng.generate(GenerationRequest(
            prompt=req.prompt,
            negative_prompt=req.negative_prompt,
            steps=req.steps,
            guidance=req.guidance,
            width=req.width,
            height=req.height,
            seed=req.seed,
            num_images=req.num_images,
        ))
        return result
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))
    except Exception as exc:
        log.exception("Üretim hatası: %s", exc)
        raise HTTPException(500, f"Üretim hatası: {exc}")


@router.get("/list")
async def list_images(limit: int = 50) -> dict:
    """Son üretilenler (yenisi önce)."""
    if not IMAGES_DIR.exists():
        return {"images": []}

    files = sorted(
        IMAGES_DIR.glob("*.png"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )[:limit]

    return {
        "images": [
            {
                "id": p.stem,
                "filename": p.name,
                "url": f"/outputs/images/{p.name}",
                "size_bytes": p.stat().st_size,
                "created": datetime.fromtimestamp(p.stat().st_mtime).isoformat(),
            }
            for p in files
        ],
    }


@router.delete("/{image_id}")
async def delete_image(image_id: str) -> dict:
    candidates = list(IMAGES_DIR.glob(f"{image_id}*.png"))
    if not candidates:
        raise HTTPException(404, "Görsel bulunamadı")
    for p in candidates:
        p.unlink()
    return {"deleted": len(candidates)}


@router.get("/status")
async def status() -> dict:
    eng = ImageEngine.get()
    return {**eng.status, "phase": "Faz 4"}
