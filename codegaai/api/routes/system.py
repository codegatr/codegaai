"""Sistem bilgisi ve sağlık kontrol uç noktaları."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from codegaai import __version__, __phase__
from codegaai.config import get_config
from codegaai.utils.system_check import run_all_checks

router = APIRouter()


@router.get("/info")
async def info() -> dict[str, Any]:
    """Uygulama bilgisi."""
    cfg = get_config()
    return {
        "name": "CODEGA AI",
        "version": __version__,
        "phase": __phase__,
        "language": cfg["app"]["language"],
        "theme": cfg["app"]["theme"],
        "models": cfg["models"],
    }


@router.get("/health")
async def health() -> dict[str, str]:
    """Basit sağlık kontrolü."""
    return {"status": "ok"}


@router.get("/check")
async def check() -> dict[str, Any]:
    """Tam sistem kontrolü çalıştır."""
    report = run_all_checks()
    return {
        "overall": report.overall_status,
        "results": [
            {
                "name": r.name,
                "status": r.status,
                "message": r.message,
                "detail": r.detail,
            }
            for r in report.results
        ],
    }


@router.get("/engines")
async def engines() -> dict[str, Any]:
    """
    Hangi motorların aktif olduğunu döndür.
    Faz 2'de hepsi inactive; sonraki fazlarda aktive olur.
    """
    return {
        "llm":      {"active": False, "reason": "Faz 3'te gelecek"},
        "image":    {"active": False, "reason": "Faz 4'te gelecek"},
        "audio":    {"active": False, "reason": "Faz 5'te gelecek"},
        "video":    {"active": False, "reason": "Faz 6'da gelecek"},
        "memory":   {"active": False, "reason": "Faz 3 ile birlikte gelecek"},
        "learning": {"active": False, "reason": "Faz 7'de gelecek"},
    }
