"""
codegaai.api.routes.calendar
==============================

Faz 29 — Takvim & Görev Yönetimi

GET  /api/calendar/events         — Tüm etkinlikler
POST /api/calendar/events         — Etkinlik ekle
DELETE /api/calendar/events/{id}  — Sil
GET  /api/calendar/tasks          — Görev listesi
POST /api/calendar/tasks          — Görev ekle
POST /api/calendar/extract        — Metinden görev/etkinlik çıkar (AI)
"""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from codegaai.config import DATA_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()

CALENDAR_FILE = DATA_DIR / "calendar.json"
TASKS_FILE = DATA_DIR / "tasks.json"


def _load(path: Path) -> list:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        pass
    return []


def _save(path: Path, data: list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Etkinlikler ───────────────────────────────────────────────────────────

class EventRequest(BaseModel):
    title: str
    date: str           # "2026-05-15"
    time: str = ""      # "14:30"
    description: str = ""
    reminder_min: int = 30


@router.get("/events")
async def get_events(upcoming: bool = False) -> dict:
    events = _load(CALENDAR_FILE)
    if upcoming:
        now = time.strftime("%Y-%m-%d")
        events = [e for e in events if e.get("date", "") >= now]
    return {"events": sorted(events, key=lambda x: x.get("date", ""))}


@router.post("/events")
async def add_event(req: EventRequest) -> dict:
    events = _load(CALENDAR_FILE)
    event = {
        "id": str(uuid.uuid4())[:8],
        "title": req.title,
        "date": req.date,
        "time": req.time,
        "description": req.description,
        "reminder_min": req.reminder_min,
        "created_at": time.strftime("%Y-%m-%d %H:%M"),
    }
    events.append(event)
    _save(CALENDAR_FILE, events)
    log.info("Etkinlik eklendi: %s (%s)", req.title, req.date)
    return {"ok": True, "event": event}


@router.delete("/events/{event_id}")
async def delete_event(event_id: str) -> dict:
    events = _load(CALENDAR_FILE)
    events = [e for e in events if e.get("id") != event_id]
    _save(CALENDAR_FILE, events)
    return {"ok": True}


# ── Görevler ──────────────────────────────────────────────────────────────

class TaskRequest(BaseModel):
    title: str
    due_date: str = ""
    priority: str = "normal"   # low | normal | high
    tags: list[str] = []


@router.get("/tasks")
async def get_tasks(done: Optional[bool] = None) -> dict:
    tasks = _load(TASKS_FILE)
    if done is not None:
        tasks = [t for t in tasks if t.get("done", False) == done]
    return {"tasks": sorted(tasks, key=lambda x: (x.get("done", False), x.get("due_date", "")))}


@router.post("/tasks")
async def add_task(req: TaskRequest) -> dict:
    tasks = _load(TASKS_FILE)
    task = {
        "id": str(uuid.uuid4())[:8],
        "title": req.title,
        "due_date": req.due_date,
        "priority": req.priority,
        "tags": req.tags,
        "done": False,
        "created_at": time.strftime("%Y-%m-%d %H:%M"),
    }
    tasks.append(task)
    _save(TASKS_FILE, tasks)
    return {"ok": True, "task": task}


@router.post("/tasks/{task_id}/done")
async def complete_task(task_id: str) -> dict:
    tasks = _load(TASKS_FILE)
    for t in tasks:
        if t.get("id") == task_id:
            t["done"] = True
            t["completed_at"] = time.strftime("%Y-%m-%d %H:%M")
    _save(TASKS_FILE, tasks)
    return {"ok": True}


# ── AI ile Görev/Etkinlik Çıkarma ────────────────────────────────────────

class ExtractRequest(BaseModel):
    text: str


@router.post("/extract")
async def extract_from_text(req: ExtractRequest) -> dict:
    """
    Metinden görev ve etkinlikleri AI ile çıkar.
    'Yarın saat 14'te toplantı var' → etkinlik
    'Fatih'e mail at' → görev
    """
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    prompt = f"""Bu metinden görev ve etkinlikleri çıkar:

"{req.text}"

JSON formatında döndür:
{{
  "events": [{{"title": "...", "date": "YYYY-MM-DD", "time": "HH:MM"}}],
  "tasks": [{{"title": "...", "priority": "high|normal|low"}}]
}}

Sadece JSON döndür."""

    msgs = [{"role": "user", "content": prompt}]
    raw = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=300, temperature=0.1)):
        raw += tok

    import re, json as _json
    added_events = []
    added_tasks = []
    try:
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            data = _json.loads(match.group(0))
            for e in data.get("events", []):
                result = await add_event(EventRequest(**e))
                added_events.append(result.get("event", {}))
            for t in data.get("tasks", []):
                result = await add_task(TaskRequest(**t))
                added_tasks.append(result.get("task", {}))
    except Exception as ex:
        log.warning("Görev çıkarma parse hatası: %s", ex)

    return {
        "extracted_events": added_events,
        "extracted_tasks": added_tasks,
        "raw": raw[:500],
    }
