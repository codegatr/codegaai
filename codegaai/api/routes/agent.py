"""
codegaai.api.routes.agent
==========================

Çok Adımlı Ajan — Karmaşık görevleri planla ve sırayla uygula.
ChatGPT Agents / CODEX Agent Mode karşılığı.

POST /api/agent/plan     — Görevi adımlara böl
POST /api/agent/run      — Planı adım adım uygula (polling ile)
GET  /api/agent/{id}     — Ajan durumu
"""

from __future__ import annotations

import asyncio
import threading
import time
import uuid
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


# ── Ajan Görevi ──────────────────────────────────────────────────────────

class AgentStep:
    def __init__(self, idx: int, title: str, tool: str, params: dict):
        self.idx = idx
        self.title = title
        self.tool = tool        # web_search | run_python | write_file | github_push | llm
        self.params = params
        self.status = "pending" # pending → running → done | error
        self.output = ""
        self.error = ""


class AgentTask:
    def __init__(self, task_id: str, goal: str):
        self.task_id = task_id
        self.goal = goal
        self.steps: list[AgentStep] = []
        self.status = "planning"  # planning → running → done | error
        self.current_step = 0
        self.final_output = ""
        self.error = ""
        self.started_at = time.time()
        self._lock = threading.Lock()

    def to_dict(self) -> dict:
        with self._lock:
            return {
                "task_id": self.task_id,
                "goal": self.goal,
                "status": self.status,
                "current_step": self.current_step,
                "total_steps": len(self.steps),
                "steps": [
                    {"idx": s.idx, "title": s.title, "tool": s.tool,
                     "status": s.status, "output": s.output[:500],
                     "error": s.error}
                    for s in self.steps
                ],
                "final_output": self.final_output,
                "error": self.error,
                "done": self.status in ("done", "error"),
                "elapsed_ms": int((time.time() - self.started_at) * 1000),
            }


_tasks: dict[str, AgentTask] = {}


# ── Araçlar ──────────────────────────────────────────────────────────────

async def _exec_step(step: AgentStep, context: str) -> str:
    """Bir adımı çalıştır, sonucu döndür."""

    if step.tool == "web_search":
        from codegaai.api.routes.jobs import _maybe_web_search
        query = step.params.get("query", "")
        return await _maybe_web_search(query) or "Sonuç bulunamadı."

    elif step.tool == "run_python":
        from codegaai.api.routes.sandbox import _run_code, _is_safe_code
        code = step.params.get("code", "")
        ok, msg = _is_safe_code(code)
        if not ok:
            return f"Güvenlik hatası: {msg}"
        result = _run_code(code, timeout=20)
        out = result.get("output", "")
        if result.get("error"):
            out += f"\nHata: {result['error']}"
        return out[:2000]

    elif step.tool == "llm":
        from codegaai.core.engine import LLMEngine, GenerationConfig
        engine = LLMEngine.get()
        if not engine.is_ready:
            return "Model yüklü değil."
        prompt = step.params.get("prompt", "")
        if context:
            prompt = f"Önceki adımlardan bilgi:\n{context}\n\n{prompt}"
        msgs = [
            {"role": "system", "content": "Sen bir görev uygulayıcısısın. Verilen adımı yap."},
            {"role": "user", "content": prompt},
        ]
        out = ""
        for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=800, temperature=0.3)):
            out += tok
        return out

    elif step.tool == "write_file":
        fname = step.params.get("filename", "output.txt")
        content = step.params.get("content", context)
        return f"[Dosya hazır: {fname} — {len(content)} karakter]"

    elif step.tool == "github_push":
        return "[GitHub push için /api/files/github/push endpoint'ini kullan]"

    return "Bilinmeyen araç."


async def _run_agent(task: AgentTask) -> None:
    """Planı adım adım uygula."""
    task.status = "running"
    context = ""

    for step in task.steps:
        with task._lock:
            task.current_step = step.idx
        step.status = "running"

        try:
            output = await _exec_step(step, context)
            step.output = output
            step.status = "done"
            context += f"\nAdım {step.idx} ({step.title}): {output[:300]}"
            log.info("Ajan adım %d/%d tamamlandı: %s", step.idx, len(task.steps), step.title)
        except Exception as e:
            step.error = str(e)
            step.status = "error"
            log.error("Ajan adım %d hatası: %s", step.idx, e)

    # Son özet
    try:
        from codegaai.core.engine import LLMEngine, GenerationConfig
        engine = LLMEngine.get()
        if engine.is_ready and context:
            msgs = [
                {"role": "system", "content": "Görev tamamlandı. Kısa özet yap."},
                {"role": "user", "content": f"Görev: {task.goal}\n\nSonuçlar:{context}"},
            ]
            summary = ""
            for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=400)):
                summary += tok
            task.final_output = summary
    except Exception:
        task.final_output = f"Tamamlandı. {len(task.steps)} adım uygulandı."

    task.status = "done"


# ── API ──────────────────────────────────────────────────────────────────

class PlanRequest(BaseModel):
    goal: str
    max_steps: int = 5


@router.post("/plan")
async def plan_task(req: PlanRequest) -> dict:
    """Görevi adımlara böl, planı döndür (henüz çalıştırma)."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    plan_prompt = f"""Şu görevi en fazla {req.max_steps} adımda planla:

GÖREV: {req.goal}

Her adımı şu JSON formatında listele:
[
  {{"title": "Adım başlığı", "tool": "araç_adı", "params": {{}}}},
  ...
]

Kullanılabilir araçlar:
- web_search: params = {{"query": "arama terimi"}}
- run_python: params = {{"code": "python kodu"}}
- llm: params = {{"prompt": "yapılacak şey"}}
- write_file: params = {{"filename": "dosya.txt"}}

SADECE JSON listesi döndür, başka bir şey yazma."""

    msgs = [
        {"role": "system", "content": "Sen bir görev planlayıcısısın. Sadece JSON döndür."},
        {"role": "user", "content": plan_prompt},
    ]
    raw = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=600, temperature=0.2)):
        raw += tok

    # JSON parse
    import json, re
    steps_data = []
    try:
        match = re.search(r'\[.*\]', raw, re.DOTALL)
        if match:
            steps_data = json.loads(match.group(0))
    except Exception:
        steps_data = [{"title": req.goal, "tool": "llm", "params": {"prompt": req.goal}}]

    task_id = str(uuid.uuid4())[:8]
    task = AgentTask(task_id=task_id, goal=req.goal)
    for i, s in enumerate(steps_data[:req.max_steps], 1):
        task.steps.append(AgentStep(
            idx=i,
            title=s.get("title", f"Adım {i}"),
            tool=s.get("tool", "llm"),
            params=s.get("params", {}),
        ))
    _tasks[task_id] = task
    log.info("Ajan planı: %s (%d adım)", req.goal[:50], len(task.steps))
    return task.to_dict()


class RunRequest(BaseModel):
    task_id: str


@router.post("/run")
async def run_task(req: RunRequest) -> dict:
    """Planlanmış görevi başlat."""
    task = _tasks.get(req.task_id)
    if not task:
        return {"error": "Görev bulunamadı"}
    if task.status not in ("planning", "done", "error"):
        return {"error": "Görev zaten çalışıyor"}

    task.status = "planning"
    task.current_step = 0

    def _thread():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_run_agent(task))
        finally:
            loop.close()

    threading.Thread(target=_thread, daemon=True, name=f"agent-{req.task_id}").start()
    return {"started": True, "task_id": req.task_id}


@router.post("/start")
async def plan_and_run(req: PlanRequest) -> dict:
    """Planla + hemen başlat (kısayol)."""
    plan = await plan_task(req)
    if "error" in plan:
        return plan
    return await run_task(RunRequest(task_id=plan["task_id"]))


@router.get("/{task_id}")
async def get_task(task_id: str) -> dict:
    task = _tasks.get(task_id)
    if not task:
        return {"error": "Bulunamadı", "done": True}
    return task.to_dict()
