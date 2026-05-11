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

import html
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import HTMLResponse
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


@router.post("/sync/full")
async def sync_full() -> dict:
    """since=0 ile tüm geçmişi senkronize et."""
    from codegaai.core.federation import FederationManager
    fm = FederationManager.get()
    if not fm.is_enabled:
        return {"error": "Federe ağ aktif değil"}
    # since sıfırla → koordinatörden tüm bilgileri al
    fm._status.last_sync = 0
    result = fm.sync()
    return {**result, "message": f"{result.get('received', 0)} öğe alındı", "status": fm.status}


@router.get("/received")
async def received_knowledge(limit: int = 20) -> dict:
    """Federe ağdan alınan bilgileri listele."""
    from codegaai.core.federation import RECEIVED_FILE
    import json
    items = []
    if RECEIVED_FILE.exists():
        lines = RECEIVED_FILE.read_text(encoding="utf-8").strip().splitlines()
        for line in reversed(lines[-limit:]):
            try:
                items.append(json.loads(line))
            except Exception:
                pass
    return {"items": items, "total": len(items)}


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


def _check_admin_token(token: str | None) -> None:
    expected = os.environ.get("CODEGA_FEDERATION_ADMIN_TOKEN", "").strip()
    if expected and token != expected:
        raise HTTPException(status_code=401, detail="Invalid federation admin token")


def _fmt_ts(value: float | None) -> str:
    if not value:
        return "-"
    return datetime.fromtimestamp(float(value), tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _fmt_age(seconds: int | None) -> str:
    if seconds is None:
        return "-"
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m"
    if seconds < 86400:
        return f"{seconds // 3600}h"
    return f"{seconds // 86400}d"


def _status_label(status: str) -> str:
    return {
        "operational": "Operational",
        "degraded": "Degraded",
        "offline": "Offline",
    }.get(status, status.title())


def _render_admin_status(snapshot: dict) -> str:
    summary = snapshot.get("summary") or {}
    overall = snapshot.get("overall_status") or "degraded"
    generated = _fmt_ts(snapshot.get("generated_at"))
    overall_text = "All federation systems operational" if overall == "operational" else "Federation is partially degraded"

    component_cards = []
    for component in snapshot.get("components") or []:
        status = html.escape(str(component.get("status") or "degraded"))
        component_cards.append(f"""
          <article class="component component--{status}">
            <div>
              <h3>{html.escape(str(component.get("name") or ""))}</h3>
              <p>{html.escape(str(component.get("detail") or ""))}</p>
            </div>
            <span class="badge badge--{status}">{_status_label(status)}</span>
          </article>
        """)

    rows = []
    for node in snapshot.get("nodes") or []:
        state = "Active" if node.get("active") else "Stale"
        state_class = "operational" if node.get("active") else "degraded"
        rows.append(f"""
          <tr>
            <td><code>{html.escape(str(node.get("node_hash") or ""))}</code></td>
            <td>{html.escape(str(node.get("version") or "-"))}</td>
            <td>{_fmt_ts(node.get("last_seen"))}</td>
            <td>{_fmt_age(node.get("age_seconds"))}</td>
            <td>{int(node.get("chats") or 0)}</td>
            <td>{int(node.get("feedback_total") or 0)}</td>
            <td>{int(node.get("adapter_count") or 0)}</td>
            <td><span class="badge badge--{state_class}">{state}</span></td>
          </tr>
        """)

    knowledge_rows = []
    for item in snapshot.get("recent_knowledge") or []:
        knowledge_rows.append(f"""
          <tr>
            <td>{html.escape(str(item.get("topic") or ""))}</td>
            <td><code>{html.escape(str(item.get("origin_hash") or ""))}</code></td>
            <td>{_fmt_ts(item.get("ts"))}</td>
          </tr>
        """)

    if not rows:
        rows.append('<tr><td colspan="8" class="empty">No nodes have checked in yet.</td></tr>')
    if not knowledge_rows:
        knowledge_rows.append('<tr><td colspan="3" class="empty">No knowledge signals yet.</td></tr>')

    return f"""<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CODEGA AI Federation Status</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg:#080a0d; --panel:#11151b; --panel2:#151a22; --line:#252d38;
      --text:#f4f7fb; --muted:#94a3b8; --ok:#10b981; --warn:#f59e0b; --bad:#ef4444;
      --accent:#f59e0b;
    }}
    * {{ box-sizing:border-box }}
    body {{ margin:0; background:var(--bg); color:var(--text); font:14px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif }}
    .wrap {{ width:min(1180px, calc(100% - 32px)); margin:0 auto; padding:32px 0 52px }}
    header {{ display:flex; justify-content:space-between; gap:24px; align-items:flex-start; padding:10px 0 28px }}
    .brand {{ display:flex; gap:14px; align-items:center }}
    .mark {{ width:42px; height:42px; border-radius:10px; display:grid; place-items:center; background:var(--accent); color:#111; font-weight:800 }}
    h1 {{ margin:0; font-size:25px; letter-spacing:0 }}
    .muted {{ color:var(--muted) }}
    .hero {{ border:1px solid var(--line); background:linear-gradient(180deg, #141922 0%, #10141a 100%); border-radius:10px; padding:24px; margin-bottom:18px }}
    .hero-main {{ display:flex; justify-content:space-between; gap:20px; align-items:center; flex-wrap:wrap }}
    .state {{ display:flex; gap:12px; align-items:center; font-size:22px; font-weight:700 }}
    .dot {{ width:13px; height:13px; border-radius:50%; background:var(--ok); box-shadow:0 0 0 6px rgba(16,185,129,.14) }}
    .hero--degraded .dot {{ background:var(--warn); box-shadow:0 0 0 6px rgba(245,158,11,.14) }}
    .metrics {{ display:grid; grid-template-columns:repeat(5, minmax(120px, 1fr)); gap:10px; margin-top:22px }}
    .metric {{ background:#0b0e13; border:1px solid var(--line); border-radius:8px; padding:14px }}
    .metric strong {{ display:block; font-size:26px; line-height:1.1 }}
    .metric span {{ color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.08em }}
    .grid {{ display:grid; grid-template-columns:1fr; gap:18px }}
    .panel {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; overflow:hidden }}
    .panel h2 {{ margin:0; padding:18px 20px; border-bottom:1px solid var(--line); font-size:15px; letter-spacing:.08em; text-transform:uppercase; color:#cbd5e1 }}
    .components {{ display:grid; gap:0 }}
    .component {{ display:flex; justify-content:space-between; gap:20px; align-items:center; padding:16px 20px; border-bottom:1px solid var(--line) }}
    .component:last-child {{ border-bottom:0 }}
    .component h3 {{ margin:0 0 2px; font-size:15px }}
    .component p {{ margin:0; color:var(--muted) }}
    .badge {{ display:inline-flex; align-items:center; border-radius:999px; padding:4px 10px; font-size:12px; font-weight:700; border:1px solid var(--line); white-space:nowrap }}
    .badge--operational {{ color:#34d399; background:rgba(16,185,129,.1); border-color:rgba(16,185,129,.35) }}
    .badge--degraded {{ color:#fbbf24; background:rgba(245,158,11,.1); border-color:rgba(245,158,11,.35) }}
    table {{ width:100%; border-collapse:collapse }}
    th, td {{ padding:12px 14px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top }}
    th {{ color:var(--muted); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.07em }}
    tr:last-child td {{ border-bottom:0 }}
    code {{ color:#fbbf24; font-family:ui-monospace, SFMono-Regular, Consolas, monospace; font-size:12px }}
    .empty {{ color:var(--muted); text-align:center; padding:26px }}
    .foot {{ margin-top:16px; color:var(--muted); font-size:12px; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap }}
    a {{ color:#fbbf24; text-decoration:none }}
    @media (max-width: 820px) {{
      header, .hero-main {{ align-items:flex-start }}
      .metrics {{ grid-template-columns:repeat(2, 1fr) }}
      table {{ display:block; overflow-x:auto }}
    }}
  </style>
</head>
<body>
  <main class="wrap">
    <header>
      <div class="brand">
        <div class="mark">C</div>
        <div>
          <h1>CODEGA AI Federation Status</h1>
          <div class="muted">Public coordinator health and knowledge flow</div>
        </div>
      </div>
      <div class="muted">Updated {generated}</div>
    </header>

    <section class="hero hero--{html.escape(overall)}">
      <div class="hero-main">
        <div class="state"><span class="dot"></span>{overall_text}</div>
        <span class="badge badge--{html.escape(overall)}">{_status_label(overall)}</span>
      </div>
      <div class="metrics">
        <div class="metric"><strong>{int(summary.get("active_peers") or 0)}</strong><span>Active peers</span></div>
        <div class="metric"><strong>{int(summary.get("recent_peers_24h") or 0)}</strong><span>Seen in 24h</span></div>
        <div class="metric"><strong>{int(summary.get("total_nodes") or 0)}</strong><span>Total nodes</span></div>
        <div class="metric"><strong>{int(summary.get("knowledge_signals") or 0)}</strong><span>Knowledge signals</span></div>
        <div class="metric"><strong>{int(summary.get("stale_nodes") or 0)}</strong><span>Stale nodes</span></div>
      </div>
    </section>

    <div class="grid">
      <section class="panel">
        <h2>Components</h2>
        <div class="components">{''.join(component_cards)}</div>
      </section>

      <section class="panel">
        <h2>Recent Nodes</h2>
        <table>
          <thead><tr><th>Node</th><th>Version</th><th>Last seen</th><th>Age</th><th>Chats</th><th>Feedback</th><th>Adapters</th><th>Status</th></tr></thead>
          <tbody>{''.join(rows)}</tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Recent Knowledge</h2>
        <table>
          <thead><tr><th>Topic</th><th>Origin</th><th>Created</th></tr></thead>
          <tbody>{''.join(knowledge_rows)}</tbody>
        </table>
      </section>
    </div>

    <div class="foot">
      <span>Raw JSON: <a href="./admin/status">/api/federation/admin/status</a></span>
      <span>Only anonymous hashes and topic signals are shown.</span>
    </div>
  </main>
</body>
</html>"""


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


@router.get("/admin", response_class=HTMLResponse)
async def coordinator_admin(token: str | None = Query(default=None)) -> HTMLResponse:
    _check_admin_token(token)
    from codegaai.core.federation import FederationCoordinator
    snapshot = FederationCoordinator().admin_snapshot(limit=40)
    return HTMLResponse(_render_admin_status(snapshot))


@router.get("/admin/status")
async def coordinator_admin_status(token: str | None = Query(default=None)) -> dict:
    _check_admin_token(token)
    from codegaai.core.federation import FederationCoordinator
    return FederationCoordinator().admin_snapshot(limit=80)


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
