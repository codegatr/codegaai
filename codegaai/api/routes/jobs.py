"""
codegaai.api.routes.jobs
========================

Background chat job system. The desktop UI polls these jobs because PyWebView
is more reliable with polling than long-lived SSE connections.
"""

from __future__ import annotations

import asyncio
import re
import threading
import time
import uuid
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


_WEB_REQUIRED_PATTERNS = [
    r"https?://",
    r"\b(site|web\s*site|internet|google|duckduckgo|haber|news)\b",
    r"\b(ara|arat|bul|bak|ziyaret et|search|find|visit|browse)\b",
    r"\b(en son|son dakika|bugün|bugun|güncel haber|latest|current)\b",
    r"\b20[2-9][0-9]\b",
]

_SELF_REFERENCE_PATTERNS = [
    r"\b(sen|senden|seni|sana|kendin|codega|asistan|cevabın|cevabin)\b",
]


def _looks_self_referential(message: str) -> bool:
    msg = message.lower()
    return any(re.search(p, msg, re.IGNORECASE) for p in _SELF_REFERENCE_PATTERNS)


def _needs_web_search(message: str) -> bool:
    msg = message.lower()
    if _looks_self_referential(msg) and not re.search(r"https?://|\binternette ara\b|\bwebde ara\b", msg):
        return False
    return any(re.search(p, msg, re.IGNORECASE) for p in _WEB_REQUIRED_PATTERNS)


def _build_recent_focus(history: list[dict], latest: str) -> str:
    recent = history[-6:]
    if not recent:
        return ""

    lines = []
    for item in recent:
        role = "Kullanıcı" if item.get("role") == "user" else "Asistan"
        content = re.sub(r"\s+", " ", str(item.get("content", ""))).strip()
        if content:
            lines.append(f"- {role}: {content[:240]}")
    if not lines:
        return ""

    return (
        "## Son Sohbet Odağı\n"
        + "\n".join(lines)
        + f"\n- Kullanıcının son mesajı: {latest[:300]}\n\n"
        "Bu son mesajı yukarıdaki bağlama göre yanıtla. Kullanıcı 'sen/senden/seni' diyorsa "
        "CODEGA AI'yi kastettiğini varsay. Konuyu Windows, haber veya başka alana kaydırma."
    )


async def _maybe_web_search(message: str) -> str:
    if not _needs_web_search(message):
        return ""

    import httpx
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

    url_match = re.search(r"https?://[^\s]+", message)
    if url_match:
        url = url_match.group(0).rstrip(".,;")
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.get(url, headers=headers, follow_redirects=True)
                text = re.sub(r"<[^>]+>", " ", r.text[:3000])
                text = re.sub(r"\s+", " ", text).strip()
                return f"[{url}]\n{text[:2000]}"
        except Exception as exc:
            log.debug("URL okuma hatası: %s", exc)

    try:
        query = message.strip()
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                "https://lite.duckduckgo.com/lite/",
                params={"q": query},
                headers=headers,
            )
        snippets = re.findall(r'class="result-snippet"[^>]*>(.*?)</td>', r.text, re.DOTALL)
        titles = re.findall(r'class="result-link"[^>]*>(.*?)</a>', r.text, re.DOTALL)
        if not snippets:
            text = re.sub(r"<[^>]+>", " ", r.text)
            text = re.sub(r"\s+", " ", text).strip()
            return f"[Web Araması: {query}]\n{text[:1500]}"

        results = []
        for i, (title, snippet) in enumerate(zip(titles, snippets)):
            title_clean = re.sub(r"<[^>]+>", "", title).strip()
            snippet_clean = re.sub(r"<[^>]+>", "", snippet).strip()
            results.append(f"{i + 1}. {title_clean}: {snippet_clean}")
            if i >= 4:
                break
        return f"[Web Araması: {query}]\n" + "\n".join(results)
    except Exception as exc:
        log.debug("Web araması hatası: %s", exc)
        return ""


class ChatJob:
    def __init__(self, job_id: str, message: str, chat_id: Optional[int], max_tokens: int):
        self.job_id = job_id
        self.message = message
        self.chat_id = chat_id
        self.max_tokens = max_tokens
        self.status = "pending"
        self.content = ""
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


_jobs: dict[str, ChatJob] = {}
_jobs_lock = threading.Lock()


def _store_job(job: ChatJob) -> None:
    with _jobs_lock:
        if len(_jobs) >= 50:
            oldest = sorted(_jobs.keys(), key=lambda k: _jobs[k].started_at)[:10]
            for key in oldest:
                del _jobs[key]
        _jobs[job.job_id] = job


def _get_job(job_id: str) -> Optional[ChatJob]:
    with _jobs_lock:
        return _jobs.get(job_id)


async def _run_chat_job(job: ChatJob) -> None:
    job.status = "running"
    try:
        from codegaai.core.engine import LLMEngine, GenerationConfig
        from codegaai.core.system_prompt import build_system_prompt
        from codegaai.core.chat_store import ChatStore

        engine = LLMEngine.get()
        if not engine.is_ready:
            job.finish(error="Model yüklü değil. Sistem -> model yükle.")
            return

        history = []
        if job.chat_id:
            try:
                store = ChatStore.open()
                msgs = store.get_messages(job.chat_id, limit=30)
                for m in msgs:
                    history.append({"role": m["role"], "content": m["content"]})
            except Exception:
                pass

        web_context = ""
        try:
            web_context = await _maybe_web_search(job.message)
        except Exception:
            pass

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

        full_context = _build_recent_focus(history, job.message)
        if web_context:
            full_context += f"\n\n## İnternet Araması Sonuçları\n{web_context}"
        if rag_text:
            full_context += f"\n\n## İlgili Bellek\n{rag_text}"

        system_prompt = build_system_prompt(rag_context=full_context)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history)
        messages.append({"role": "user", "content": job.message})

        if job.chat_id:
            try:
                store = ChatStore.open()
                store.add_message(job.chat_id, "user", job.message)
            except Exception:
                pass

        cfg = GenerationConfig(max_tokens=job.max_tokens, temperature=0.55)
        for token in engine.stream(messages, cfg=cfg):
            job.append(token)

        if job.chat_id and job.content:
            try:
                store = ChatStore.open()
                store.add_message(job.chat_id, "assistant", job.content)
            except Exception:
                pass

        job.finish()
        log.info(
            "ChatJob %s tamamlandı: %d token, %.1fs",
            job.job_id,
            len(job.content.split()),
            time.time() - job.started_at,
        )
    except Exception as exc:
        log.error("ChatJob %s hata: %s", job.job_id, exc)
        job.finish(error=str(exc)[:200])


class ChatJobRequest(BaseModel):
    message: str
    chat_id: Optional[int] = None
    max_tokens: int = 512


@router.post("/chat")
async def start_chat_job(req: ChatJobRequest) -> dict:
    job_id = str(uuid.uuid4())[:8]
    job = ChatJob(
        job_id=job_id,
        message=req.message,
        chat_id=req.chat_id,
        max_tokens=req.max_tokens,
    )
    _store_job(job)

    def _run_in_thread() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_run_chat_job(job))
        finally:
            loop.close()

    thread = threading.Thread(target=_run_in_thread, daemon=True, name=f"chat-job-{job_id}")
    thread.start()
    return {"job_id": job_id, "status": "pending"}


@router.get("/{job_id}")
async def get_job(job_id: str) -> dict:
    job = _get_job(job_id)
    if not job:
        return {"error": "İş bulunamadı", "done": True}
    return job.to_dict()
