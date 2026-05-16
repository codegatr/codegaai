"""
codegaai.api.routes.monitor
=============================

Faz 49 — Çalışma Zamanı İzleme     CPU/RAM/Disk/GPU anlık + geçmiş grafik
Faz 50 — Akıllı Proje Yöneticisi   Görev panosu, sprint, AI öncelik tahmini
"""
from __future__ import annotations

import json, time, threading, uuid
from collections import deque
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel
from codegaai.config import DATA_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


# ══════════════════════════════════════════════════════════
# FAZ 49 — Çalışma Zamanı İzleme
# ══════════════════════════════════════════════════════════

# Metrik geçmişi (son 60 ölçüm = 5 dakika @ 5sn aralık)
_metrics_history: deque = deque(maxlen=60)
_monitor_active = False
_monitor_thread = None


def _collect_metrics() -> dict:
    """Anlık sistem metriklerini topla."""
    m: dict = {"ts": time.strftime("%H:%M:%S"), "timestamp": time.time()}
    try:
        import psutil
        m["cpu_percent"]    = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        m["ram_used_gb"]    = round(mem.used / 1e9, 2)
        m["ram_total_gb"]   = round(mem.total / 1e9, 2)
        m["ram_percent"]    = mem.percent
        disk = psutil.disk_usage("/")
        m["disk_used_gb"]   = round(disk.used / 1e9, 1)
        m["disk_total_gb"]  = round(disk.total / 1e9, 1)
        m["disk_percent"]   = disk.percent
        # Ağ I/O
        net = psutil.net_io_counters()
        m["net_sent_mb"]    = round(net.bytes_sent / 1e6, 1)
        m["net_recv_mb"]    = round(net.bytes_recv / 1e6, 1)
    except Exception:
        pass

    # GPU (opsiyonel)
    try:
        import torch
        if torch.cuda.is_available():
            info = torch.cuda.mem_get_info(0)
            m["gpu_vram_free_gb"]  = round(info[0] / 1e9, 2)
            m["gpu_vram_total_gb"] = round(info[1] / 1e9, 2)
            m["gpu_vram_percent"]  = round((1 - info[0] / info[1]) * 100, 1)
    except Exception:
        pass

    # CODEGA AI motoru
    try:
        from codegaai.core.engine import LLMEngine
        st = LLMEngine.get().status
        m["llm_state"]    = st.get("state", "unloaded")
        m["llm_model_id"] = st.get("model_id", "")
    except Exception:
        pass

    return m


def _monitor_loop(interval: int = 5):
    """Arka planda periyodik metrik toplama."""
    global _monitor_active
    log.info("Sistem monitörü başladı (her %ds)", interval)
    while _monitor_active:
        try:
            snapshot = _collect_metrics()
            _metrics_history.append(snapshot)
        except Exception as e:
            log.debug("Metrik toplama hatası: %s", e)
        time.sleep(interval)
    log.info("Sistem monitörü durduruldu")


@router.get("/system/snapshot")
async def system_snapshot() -> dict:
    """Anlık sistem durumu — Faz 49."""
    m = _collect_metrics()
    # Durum değerlendirmesi
    warnings = []
    if m.get("ram_percent", 0) > 85:
        warnings.append(f"RAM yüksek: {m['ram_percent']}%")
    if m.get("cpu_percent", 0) > 90:
        warnings.append(f"CPU yüksek: {m['cpu_percent']}%")
    if m.get("disk_percent", 0) > 90:
        warnings.append(f"Disk dolu: {m['disk_percent']}%")
    if m.get("gpu_vram_percent", 0) > 90:
        warnings.append(f"GPU VRAM yüksek: {m['gpu_vram_percent']}%")
    m["warnings"] = warnings
    m["health"]   = "critical" if len(warnings) >= 2 else "warning" if warnings else "ok"
    m["phase"]    = "Faz 49"
    return m


@router.get("/system/history")
async def system_history(last_n: int = 30) -> dict:
    """Metrik geçmişi — Faz 49."""
    history = list(_metrics_history)[-last_n:]
    return {
        "history": history,
        "count":   len(history),
        "monitoring_active": _monitor_active,
        "phase": "Faz 49",
    }


class MonitorRequest(BaseModel):
    enabled: bool
    interval_sec: int = 5


@router.post("/system/monitor")
async def toggle_monitor(req: MonitorRequest) -> dict:
    """İzlemeyi başlat/durdur — Faz 49."""
    global _monitor_active, _monitor_thread
    if req.enabled and not _monitor_active:
        _monitor_active = True
        _monitor_thread = threading.Thread(
            target=_monitor_loop,
            args=(max(2, req.interval_sec),),
            daemon=True, name="sys-monitor"
        )
        _monitor_thread.start()
        return {"monitoring": True, "interval_sec": req.interval_sec, "phase": "Faz 49"}
    elif not req.enabled:
        _monitor_active = False
        return {"monitoring": False, "phase": "Faz 49"}
    return {"monitoring": _monitor_active, "phase": "Faz 49"}


@router.get("/system/alert-config")
async def alert_config() -> dict:
    """Uyarı eşikleri — Faz 49."""
    return {
        "thresholds": {
            "cpu_percent":   90,
            "ram_percent":   85,
            "disk_percent":  90,
            "vram_percent":  90,
        },
        "phase": "Faz 49",
    }


@router.get("/system/process-list")
async def process_list(top_n: int = 10) -> dict:
    """En çok kaynak kullanan processler — Faz 49."""
    try:
        import psutil
        procs = []
        for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent"]):
            try:
                info = proc.info
                if info["cpu_percent"] is not None:
                    procs.append(info)
            except Exception:
                pass
        procs.sort(key=lambda p: p.get("cpu_percent", 0), reverse=True)
        return {"processes": procs[:top_n], "phase": "Faz 49"}
    except ImportError:
        return {"error": "psutil gerekli", "phase": "Faz 49"}


# ══════════════════════════════════════════════════════════
# FAZ 50 — Akıllı Proje Yöneticisi
# ══════════════════════════════════════════════════════════

PROJECTS_FILE = DATA_DIR / "projects.json"
TASKS_FILE    = DATA_DIR / "project_tasks.json"


def _load_projects() -> list:
    try:
        if PROJECTS_FILE.exists():
            return json.loads(PROJECTS_FILE.read_text("utf-8"))
    except Exception:
        pass
    return []


def _load_tasks() -> list:
    try:
        if TASKS_FILE.exists():
            return json.loads(TASKS_FILE.read_text("utf-8"))
    except Exception:
        pass
    return []


def _save_projects(data: list) -> None:
    PROJECTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    PROJECTS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


def _save_tasks(data: list) -> None:
    TASKS_FILE.parent.mkdir(parents=True, exist_ok=True)
    TASKS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


# ── Projeler ─────────────────────────────────────────────

class ProjectRequest(BaseModel):
    name: str
    description: str = ""
    deadline: str = ""    # YYYY-MM-DD
    tech_stack: list[str] = []


@router.post("/projects")
async def create_project(req: ProjectRequest) -> dict:
    """Proje oluştur — Faz 50."""
    projects = _load_projects()
    project = {
        "id":          uuid.uuid4().hex[:8],
        "name":        req.name,
        "description": req.description,
        "deadline":    req.deadline,
        "tech_stack":  req.tech_stack,
        "created_at":  time.strftime("%Y-%m-%d"),
        "status":      "active",   # active | paused | completed
        "progress":    0,
    }
    projects.append(project)
    _save_projects(projects)
    return {"ok": True, "project": project, "phase": "Faz 50"}


@router.get("/projects")
async def list_projects() -> dict:
    projects = _load_projects()
    # Her projenin görev istatistiklerini ekle
    tasks = _load_tasks()
    for p in projects:
        p_tasks = [t for t in tasks if t.get("project_id") == p["id"]]
        done    = sum(1 for t in p_tasks if t.get("status") == "done")
        p["task_count"]   = len(p_tasks)
        p["done_count"]   = done
        p["progress"]     = round(done / max(len(p_tasks), 1) * 100)
    return {"projects": projects, "count": len(projects), "phase": "Faz 50"}


# ── Görevler ─────────────────────────────────────────────

class TaskRequest(BaseModel):
    project_id: str
    title: str
    description: str = ""
    priority: str = "medium"   # low | medium | high | critical
    status: str = "todo"       # todo | in_progress | review | done
    sprint: int = 1
    estimated_hours: float = 0
    tags: list[str] = []


@router.post("/tasks")
async def create_task(req: TaskRequest) -> dict:
    """Görev oluştur — Faz 50."""
    tasks = _load_tasks()
    task = {
        "id":               uuid.uuid4().hex[:8],
        "project_id":       req.project_id,
        "title":            req.title,
        "description":      req.description,
        "priority":         req.priority,
        "status":           req.status,
        "sprint":           req.sprint,
        "estimated_hours":  req.estimated_hours,
        "actual_hours":     0,
        "tags":             req.tags,
        "created_at":       time.strftime("%Y-%m-%d"),
        "ai_priority_score": 0,   # AI tarafından atanır
    }
    tasks.append(task)
    _save_tasks(tasks)
    return {"ok": True, "task": task, "phase": "Faz 50"}


@router.get("/tasks/{project_id}")
async def project_tasks(project_id: str, status: str = "") -> dict:
    tasks = _load_tasks()
    filtered = [t for t in tasks if t.get("project_id") == project_id]
    if status:
        filtered = [t for t in filtered if t.get("status") == status]
    # Önceliğe göre sırala
    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    filtered.sort(key=lambda t: (priority_order.get(t.get("priority", "medium"), 2),
                                  -t.get("ai_priority_score", 0)))
    return {"tasks": filtered, "count": len(filtered), "phase": "Faz 50"}


class TaskUpdateRequest(BaseModel):
    task_id: str
    status: str = ""
    actual_hours: float = 0


@router.put("/tasks/{task_id}")
async def update_task(task_id: str, req: TaskUpdateRequest) -> dict:
    tasks = _load_tasks()
    for t in tasks:
        if t["id"] == task_id:
            if req.status:
                t["status"] = req.status
                if req.status == "done":
                    t["completed_at"] = time.strftime("%Y-%m-%d")
            if req.actual_hours:
                t["actual_hours"] = req.actual_hours
            break
    _save_tasks(tasks)
    return {"ok": True, "phase": "Faz 50"}


# ── AI Öncelik Tahmini ───────────────────────────────────

@router.post("/tasks/{project_id}/ai-prioritize")
async def ai_prioritize_tasks(project_id: str) -> dict:
    """AI ile görevleri önceliklendir — Faz 50."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    tasks = [t for t in _load_tasks() if t.get("project_id") == project_id]
    if not tasks:
        return {"error": "Görev bulunamadı"}

    task_list = "\n".join(
        f"- ID:{t['id']} | {t['title']} | {t['priority']} | {t['status']}"
        for t in tasks[:20]
    )
    msgs = [
        {"role": "system", "content": "Proje yöneticisi. Görevleri önceliklendir. JSON döndür."},
        {"role": "user", "content":
         f"Bu görevleri öncelik skoruyla sırala (0-100):\n{task_list}\n\n"
         f'JSON: [{{"id":"...","score":85,"reason":"..."}}]'},
    ]
    raw = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=400, temperature=0.3)):
        raw += tok

    updated = 0
    try:
        import re as _re
        m = _re.search(r'\[.*\]', raw, _re.DOTALL)
        if m:
            scores = json.loads(m.group(0))
            all_tasks = _load_tasks()
            score_map = {s["id"]: s for s in scores}
            for t in all_tasks:
                if t["id"] in score_map:
                    t["ai_priority_score"] = score_map[t["id"]].get("score", 0)
                    t["ai_priority_reason"] = score_map[t["id"]].get("reason", "")
                    updated += 1
            _save_tasks(all_tasks)
    except Exception as e:
        log.warning("AI önceliklendirme parse hatası: %s", e)

    tasks_updated = [t for t in _load_tasks() if t.get("project_id") == project_id]
    tasks_updated.sort(key=lambda t: -t.get("ai_priority_score", 0))
    return {
        "prioritized_tasks": tasks_updated[:20],
        "updated_count":     updated,
        "phase":             "Faz 50",
    }


# ── Sprint Planlama ──────────────────────────────────────

@router.get("/sprint/{project_id}/{sprint_num}")
async def sprint_board(project_id: str, sprint_num: int) -> dict:
    """Sprint panosu — Faz 50."""
    tasks = [
        t for t in _load_tasks()
        if t.get("project_id") == project_id and t.get("sprint") == sprint_num
    ]
    board = {"todo": [], "in_progress": [], "review": [], "done": []}
    for t in tasks:
        status = t.get("status", "todo")
        board.setdefault(status, []).append(t)

    total_est    = sum(t.get("estimated_hours", 0) for t in tasks)
    total_actual = sum(t.get("actual_hours", 0) for t in tasks)

    return {
        "sprint":       sprint_num,
        "project_id":   project_id,
        "board":        board,
        "task_count":   len(tasks),
        "done_count":   len(board["done"]),
        "velocity":     round(len(board["done"]) / max(sprint_num, 1), 1),
        "total_estimated_hours": total_est,
        "total_actual_hours":    total_actual,
        "phase":        "Faz 50",
    }


@router.post("/projects/{project_id}/ai-plan")
async def ai_project_plan(project_id: str) -> dict:
    """Proje için AI sprint planı üret — Faz 50."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    projects = _load_projects()
    project  = next((p for p in projects if p["id"] == project_id), None)
    if not project:
        return {"error": "Proje bulunamadı"}

    tasks = [t for t in _load_tasks() if t.get("project_id") == project_id]
    task_list = "\n".join(f"- {t['title']} ({t['priority']})" for t in tasks[:20])

    msgs = [
        {"role": "system", "content": "Deneyimli yazılım proje yöneticisisin."},
        {"role": "user", "content":
         f"Proje: {project['name']}\nDeadline: {project.get('deadline', 'belirsiz')}\n"
         f"Tech: {', '.join(project.get('tech_stack', []))}\n\n"
         f"Görevler:\n{task_list}\n\n"
         "2 haftalık sprint planı hazırla. Sprint hedeflerini, risk'leri ve önerileri belirt."},
    ]
    plan = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=600, temperature=0.4)):
        plan += tok

    return {
        "project": project["name"],
        "plan":    plan.strip(),
        "phase":   "Faz 50",
    }
