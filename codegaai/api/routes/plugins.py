"""
codegaai.api.routes.plugins
=============================

Faz 27 — Plugin API

GET  /api/plugins           — Yüklü eklentiler
POST /api/plugins/execute   — Eklenti çalıştır
POST /api/plugins/install   — URL'den kur
POST /api/plugins/{id}/toggle — Etkinleştir/Devre dışı
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from codegaai.core.plugin_manager import PluginManager
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.get("")
async def list_plugins() -> dict:
    return {"plugins": PluginManager.get().list_plugins()}


class ExecuteRequest(BaseModel):
    plugin_id: str
    command: str
    params: dict = {}


@router.post("/execute")
async def execute_plugin(req: ExecuteRequest) -> dict:
    result = PluginManager.get().execute(
        plugin_id=req.plugin_id,
        command=req.command,
        params=req.params,
    )
    return {"result": result, "plugin_id": req.plugin_id}


class InstallRequest(BaseModel):
    url: str


@router.post("/install")
async def install_plugin(req: InstallRequest) -> dict:
    return PluginManager.get().install_from_url(req.url)


@router.post("/{plugin_id}/toggle")
async def toggle_plugin(plugin_id: str) -> dict:
    pm = PluginManager.get()
    if plugin_id not in pm._plugins:
        return {"error": "Plugin bulunamadı"}
    pm._plugins[plugin_id].enabled = not pm._plugins[plugin_id].enabled
    state = pm._plugins[plugin_id].enabled
    return {"plugin_id": plugin_id, "enabled": state}


@router.post("/match")
async def match_command(body: dict) -> dict:
    """Metinde plugin komutu var mı?"""
    text = body.get("text", "")
    match = PluginManager.get().match_command(text)
    if match:
        pid, meta = match
        return {"found": True, "plugin_id": pid, "plugin_name": meta.name}
    return {"found": False}
