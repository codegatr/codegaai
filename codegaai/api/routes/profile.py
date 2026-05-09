"""
Kullanıcı profili uç noktaları.

GET  /api/profile          — profili getir
PATCH /api/profile         — profili güncelle
POST /api/profile/fact     — bilgi ekle
POST /api/profile/project  — proje ekle
DELETE /api/profile/reset  — profili sıfırla
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()


class ProfileUpdate(BaseModel):
    name: str = ""
    location: str = ""
    occupation: str = ""
    language: str = ""
    preferred_tone: str = ""
    detail_level: str = ""
    prefers_code_examples: bool | None = None


class FactRequest(BaseModel):
    fact: str = Field(..., min_length=1, max_length=1000)


class ProjectRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""


@router.get("")
async def get_profile() -> dict:
    from codegaai.core.user_profile import ProfileManager
    return ProfileManager.get().to_dict()


@router.patch("")
async def update_profile(req: ProfileUpdate) -> dict:
    from codegaai.core.user_profile import ProfileManager
    updates = {k: v for k, v in req.dict().items() if v is not None and v != ""}
    ProfileManager.get().update(**updates)
    return ProfileManager.get().to_dict()


@router.post("/fact")
async def add_fact(req: FactRequest) -> dict:
    from codegaai.core.user_profile import ProfileManager
    ProfileManager.get().add_fact(req.fact)
    return {"ok": True, "facts": ProfileManager.get().profile.facts}


@router.post("/project")
async def add_project(req: ProjectRequest) -> dict:
    from codegaai.core.user_profile import ProfileManager
    ProfileManager.get().add_project(req.name, req.description)
    return {"ok": True, "projects": ProfileManager.get().profile.projects}


@router.delete("/reset")
async def reset_profile() -> dict:
    from codegaai.core.user_profile import ProfileManager, UserProfile, PROFILE_PATH
    ProfileManager._instance = None
    if PROFILE_PATH.exists():
        PROFILE_PATH.unlink()
    return {"ok": True, "message": "Profil sıfırlandı"}
