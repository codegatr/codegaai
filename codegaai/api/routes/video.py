"""Video uç noktaları (Faz 6)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from codegaai.core.frontier_capabilities import plan_capabilities
from codegaai.core.video_engine import VIDEOS_DIR, VideoEngine, VideoRequest
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


class GenerateVideoRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    negative_prompt: str = Field("", max_length=1000)
    steps: int = Field(50, ge=1, le=200)
    guidance: float = Field(6.0, ge=0.0, le=20.0)
    frames: int = Field(49, ge=8, le=120)
    fps: int = Field(8, ge=4, le=30)
    width: int = Field(720, ge=320, le=1920)
    height: int = Field(480, ge=240, le=1080)
    seed: Optional[int] = Field(None, ge=0, le=2**32 - 1)
    image_path: Optional[str] = None


@router.post("/generate")
async def generate(req: GenerateVideoRequest) -> dict:
    eng = VideoEngine.get()
    plan = plan_capabilities(req.prompt)
    if not eng.is_ready:
        raise HTTPException(
            409,
            "Video motoru yüklü değil. Sistem → Video Modelleri'nden "
            "CogVideoX-2B veya güçlü sistemlerde CogVideoX-5B indir ve yükle. "
            f"Önerilen hat: {', '.join(plan.video_pipeline.get('local_models', []))}"
        )

    try:
        result = eng.generate(VideoRequest(
            prompt=req.prompt,
            negative_prompt=req.negative_prompt,
            steps=req.steps,
            guidance=req.guidance,
            frames=req.frames,
            fps=req.fps,
            width=req.width,
            height=req.height,
            seed=req.seed,
            image_path=req.image_path,
        ))
        result["capability_plan"] = plan.to_dict()
        return result
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))
    except Exception as exc:
        log.exception("Video üretim hatası: %s", exc)
        raise HTTPException(500, f"Üretim hatası: {exc}")


@router.post("/plan")
async def plan_video(req: GenerateVideoRequest) -> dict:
    """Video talimatını üretim öncesi storyboard/pipeline planına çevir."""
    plan = plan_capabilities(req.prompt)
    return plan.to_dict()


@router.get("/list")
async def list_videos(limit: int = 30) -> dict:
    if not VIDEOS_DIR.exists():
        return {"videos": []}
    files = sorted(
        VIDEOS_DIR.glob("*.mp4"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )[:limit]

    return {
        "videos": [
            {
                "id": p.stem,
                "filename": p.name,
                "url": f"/outputs/videos/{p.name}",
                "size_bytes": p.stat().st_size,
                "created": datetime.fromtimestamp(p.stat().st_mtime).isoformat(),
            }
            for p in files
        ],
    }


@router.delete("/{video_id}")
async def delete_video(video_id: str) -> dict:
    candidates = list(VIDEOS_DIR.glob(f"{video_id}*.mp4"))
    if not candidates:
        raise HTTPException(404, "Video bulunamadı")
    for p in candidates:
        p.unlink()
    return {"deleted": len(candidates)}


@router.get("/status")
async def status() -> dict:
    eng = VideoEngine.get()
    return {**eng.status, "phase": "Faz 6"}
