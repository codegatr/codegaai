"""
codegaai.api.routes.session
=============================

GET  /api/session/current   — Aktif oturum özeti
GET  /api/session/history   — Geçmiş oturumlar
GET  /api/session/report    — MD formatında rapor
POST /api/session/log       — Değişiklik kaydet
POST /api/session/close     — Oturumu kapat
POST /api/session/fix       — Hata düzeltmesi kaydet
"""

from __future__ import annotations
from fastapi import APIRouter
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.get("/current")
async def current_session() -> dict:
    from codegaai.core.session_log import SessionLog
    return SessionLog.get().current_summary()


@router.get("/history")
async def session_history(limit: int = 10) -> dict:
    from codegaai.core.session_log import SessionLog
    return {"sessions": SessionLog.get().history(limit)}


@router.get("/report")
async def session_report() -> PlainTextResponse:
    from codegaai.core.session_log import SessionLog
    md = SessionLog.get().generate_markdown_report()
    return PlainTextResponse(md, media_type="text/markdown")


class LogRequest(BaseModel):
    category: str = "feature"   # feature|fix|refactor|ui|perf|security
    title: str
    detail: str = ""
    files: list[str] = []


@router.post("/log")
async def log_change(req: LogRequest) -> dict:
    from codegaai.core.session_log import SessionLog
    SessionLog.get().log_change(req.category, req.title, req.detail, req.files)
    return {"ok": True}


class FixRequest(BaseModel):
    bug: str
    solution: str


@router.post("/fix")
async def log_fix(req: FixRequest) -> dict:
    from codegaai.core.session_log import SessionLog
    SessionLog.get().log_fix(req.bug, req.solution)
    return {"ok": True}


class CloseRequest(BaseModel):
    summary: str = ""


@router.post("/close")
async def close_session(req: CloseRequest) -> dict:
    from codegaai.core.session_log import SessionLog
    sid = SessionLog.get().close_session(req.summary)
    return {"ok": True, "closed_session_id": sid}
