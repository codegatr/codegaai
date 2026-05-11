"""
Federation endpoints.

Client:
GET  /api/federation/status
POST /api/federation/enable
POST /api/federation/disable
POST /api/federation/sync

Coordinator:
POST /api/federation/stats
GET  /api/federation/knowledge
GET  /api/federation/nodes
"""

from __future__ import annotations

from fastapi import APIRouter, Header, Query
from pydantic import BaseModel, Field

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


class EnableRequest(BaseModel):
    coordinator: str = "https://ai.codega.com.tr/api/federation"


class CoordinatorStatsRequest(BaseModel):
    type: str = "node_stats"
    data: dict = Field(default_factory=dict)


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
    return {"disabled": True, "status": FederationManager.get().status}


@router.post("/sync")
async def sync() -> dict:
    from codegaai.core.federation import FederationManager
    fm = FederationManager.get()
    if not fm.is_enabled:
        return {"error": "Federated network is not active. Enable it first.", "status": fm.status}
    result = fm.sync()
    return {**result, "status": fm.status}


@router.get("/node-id")
async def node_id() -> dict:
    from codegaai.core.federation import FederationManager
    fm = FederationManager.get()
    return {
        "node_id_masked": fm.node_id[:8] + "..." + fm.node_id[-4:],
        "full_visible": False,
    }


def _node_id_from_header(x_node_id: str | None) -> str:
    from codegaai.core.federation import FederationManager
    return x_node_id or FederationManager.get().node_id


async def _coordinator_stats_impl(
    req: CoordinatorStatsRequest,
    x_node_id: str | None,
) -> dict:
    from codegaai.core.federation import FederationCoordinator
    node_id_value = _node_id_from_header(x_node_id)
    payload = req.model_dump() if hasattr(req, "model_dump") else req.dict()
    return FederationCoordinator().submit_stats(payload, node_id_value)


async def _coordinator_knowledge_impl(
    since: float,
    x_node_id: str | None,
) -> dict:
    from codegaai.core.federation import FederationCoordinator
    node_id_value = _node_id_from_header(x_node_id)
    return FederationCoordinator().knowledge(node_id_value, since=since)


async def _coordinator_nodes_impl() -> dict:
    from codegaai.core.federation import FederationCoordinator
    return FederationCoordinator().nodes()


@router.post("/stats")
async def coordinator_stats(
    req: CoordinatorStatsRequest,
    x_node_id: str | None = Header(default=None),
) -> dict:
    return await _coordinator_stats_impl(req, x_node_id)


@router.get("/knowledge")
async def coordinator_knowledge(
    since: float = Query(default=0),
    x_node_id: str | None = Header(default=None),
) -> dict:
    return await _coordinator_knowledge_impl(since, x_node_id)


@router.get("/nodes")
async def coordinator_nodes() -> dict:
    return await _coordinator_nodes_impl()


@router.post("/coordinator/stats")
async def coordinator_stats_alias(
    req: CoordinatorStatsRequest,
    x_node_id: str | None = Header(default=None),
) -> dict:
    return await _coordinator_stats_impl(req, x_node_id)


@router.get("/coordinator/knowledge")
async def coordinator_knowledge_alias(
    since: float = Query(default=0),
    x_node_id: str | None = Header(default=None),
) -> dict:
    return await _coordinator_knowledge_impl(since, x_node_id)


@router.get("/coordinator/nodes")
async def coordinator_nodes_alias() -> dict:
    return await _coordinator_nodes_impl()
