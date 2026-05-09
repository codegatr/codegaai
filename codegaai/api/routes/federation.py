"""
Federe Ağ uç noktaları.

GET  /api/federation/status         — node durumu
POST /api/federation/enable         — federe ağa katıl
POST /api/federation/disable        — ağdan çık
POST /api/federation/sync           — manuel senkronizasyon
GET  /api/federation/peers          — komşu node'lar (koordinatörden)

--- Koordinatör endpoint'leri (ai.codega.com.tr üzerinde çalışır) ---
POST /api/federation/coordinator/stats     — node stats al
GET  /api/federation/coordinator/knowledge — bilgi dağıt
GET  /api/federation/coordinator/nodes    — aktif node listesi
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


class EnableRequest(BaseModel):
    coordinator: str = "https://ai.codega.com.tr/api/federation"


@router.get("/status")
async def status() -> dict:
    from codegaai.core.federation import FederationManager
    return {
        **FederationManager.get().status,
        "phase": "Faz 12",
    }


@router.post("/enable")
async def enable(req: EnableRequest) -> dict:
    from codegaai.core.federation import FederationManager
    ok = FederationManager.get().enable(req.coordinator)
    return {"enabled": ok, "status": FederationManager.get().status}


@router.post("/disable")
async def disable() -> dict:
    from codegaai.core.federation import FederationManager
    FederationManager.get().disable()
    return {"disabled": True}


@router.post("/sync")
async def sync() -> dict:
    from codegaai.core.federation import FederationManager
    fm = FederationManager.get()
    if not fm.is_enabled:
        return {"error": "Federe ağ aktif değil. Önce /enable"}
    result = fm.sync()
    return {**result, "status": fm.status}


@router.get("/node-id")
async def node_id() -> dict:
    """Node kimliğini görüntüle (maskelenmiş)."""
    from codegaai.core.federation import FederationManager
    fm = FederationManager.get()
    return {
        "node_id_masked": fm.node_id[:8] + "..." + fm.node_id[-4:],
        "full_visible": False,
    }
