"""
codegaai.api.routes.jobs
===========================

Arka plan iş sistemi — LLM yanıtlarını polling ile sunar.
EventSource/SSE yerine kullanılır, PyWebView'da daha güvenilir.

POST /api/jobs/chat  → {job_id}   (anında döner)
GET  /api/jobs/{id}  → {status, content, done, elapsed}
"""

from __future__ import annotations

import threading
import time
import uuid
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


# ── İş deposu (bellekte) ────────────────────────────────────────────────

class ChatJob:
    def __init__(self, job_id: str, message: str, chat_id: Optional[int],
                 max_tokens: int):
        self.job_id = job_id
        self.message = message
        self.chat_id = chat_id
        self.max_tokens = max_tokens
        self.status = "pending"   # pending → running → done | error
        self.content = ""         # birikerek büyür
        self.error = ""
        self.started_at = time.time()
        self.finished_at: Optional[float] = None
        self._lock = threading.Lock()

    def append(self, token: str) -> None:
        with self._lock:
            self.content += token

    def finish(self, error: str = "") -> None:
        with self._lock:
            self.status = "error" if error else "done"
            self.error = error
            self.finished_at = time.time()

    def to_dict(self) -> dict:
        with self._lock:
            elapsed = (self.finished_at or time.time()) - self.started_at
            return {
                "job_id": self.job_id,
                "status": self.status,
                "content": self.content,
                "error": self.error,
                "done": self.status in ("done", "error"),
                "elapsed_ms": int(elapsed * 1000),
            }


# Maksimum 50 iş tut (eski işler silinir)
_jobs: dict[str, ChatJob] = {}
_jobs_lock = threading.Lock()

def _store_job(job: ChatJob) -> None:
    with _jobs_lock:
        if len(_jobs) >= 50:
            # En eski 10 işi sil
            oldest = sorted(_jobs.keys(),
                            key=lambda k: _jobs[k].started_at)[:10]
            for k in oldest:
                del _jobs[k]
        _jobs[job.job_id] = job

def _get_job(job_id: str) -> Optional[ChatJob]:
    with _jobs_lock:
        return _jobs.get(job_id)


# ── İş çalıştırıcı ───────────────────────────────────────────────────────

def _run_chat_job(job: ChatJob) -> None:
    """Arka thread'de LLM çalıştır, tokenleri job.content'e ekle."""
    job.status = "running"
    try:
        from codegaai.core.engine import LLMEngine
        from codegaai.core.system_prompt import build_system_prompt
        from codegaai.core.chat_store import ChatStore

        engine = LLMEngine.get()
        if not engine.is_ready:
            job.finish(error="Model yüklü değil. Sistem → model yükle.")
            return

        # RAG bağlamı
        rag_text = ""
        try:
            from codegaai.core.memory import MemoryStore
            from codegaai.core.embeddings import EmbeddingService
            if EmbeddingService.get().is_ready:
                mem = MemoryStore.open()
                hits = mem.search(job.message, n_results=3)
                if hits:
                    rag_text = "\n".join(h.get("text", "")[:300] for h in hits)
        except Exception:
            pass

        system_prompt = build_system_prompt(rag_context=rag_text)

        # Sohbet geçmişi
        history = []
        if job.chat_id:
            try:
                store = ChatStore.open()
                msgs = store.get_messages(job.chat_id, limit=10)
                for m in msgs[:-1]:  # Son mesaj (kullanıcının) hariç
                    history.append({"role": m["role"], "content": m["content"]})
            except Exception:
                pass

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history)
        messages.append({"role": "user", "content": job.message})

        # Streaming üret
        for token in engine.stream(messages, cfg={"max_tokens": job.max_tokens,
                                                   "temperature": 0.7}):
            job.append(token)

        # Sohbet geçmişine kaydet
        if job.chat_id and job.content:
            try:
                store = ChatStore.open()
                store.add_message(job.chat_id, "user", job.message)
                store.add_message(job.chat_id, "assistant", job.content)
            except Exception:
                pass

        job.finish()
        log.info("ChatJob %s tamamlandı: %d token, %.1fs",
                 job.job_id, len(job.content.split()), time.time()-job.started_at)

    except Exception as exc:
        log.error("ChatJob %s hata: %s", job.job_id, exc)
        job.finish(error=str(exc)[:200])


# ── API ─────────────────────────────────────────────────────────────────

class ChatJobRequest(BaseModel):
    message: str
    chat_id: Optional[int] = None
    max_tokens: int = 512


@router.post("/chat")
async def start_chat_job(req: ChatJobRequest) -> dict:
    """
    LLM işini başlat. Anında job_id döner.
    Sonucu GET /api/jobs/{job_id} ile polling yap.
    """
    job_id = str(uuid.uuid4())[:8]
    job = ChatJob(
        job_id=job_id,
        message=req.message,
        chat_id=req.chat_id,
        max_tokens=req.max_tokens,
    )
    _store_job(job)

    # Arka thread'de çalıştır
    t = threading.Thread(target=_run_chat_job, args=(job,),
                         daemon=True, name=f"chat-job-{job_id}")
    t.start()

    return {"job_id": job_id, "status": "pending"}


@router.get("/{job_id}")
async def get_job(job_id: str) -> dict:
    """İş durumunu ve birikmiş içeriği döndür."""
    job = _get_job(job_id)
    if not job:
        return {"error": "İş bulunamadı", "done": True}
    return job.to_dict()
