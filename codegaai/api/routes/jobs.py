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


def _clean_visible_answer(text: str) -> tuple[str, str]:
    """Remove leaked private thought blocks without losing the whole reply."""
    if not text:
        return "", ""

    thought_parts: list[str] = []

    def _capture(match: re.Match) -> str:
        thought_parts.append(match.group(1).strip())
        return ""

    cleaned = re.sub(
        r"<think(?:ing)?>(.*?)</think(?:ing)?>\s*",
        _capture,
        text,
        flags=re.DOTALL | re.IGNORECASE,
    )
    # If the model opened a thought tag and never closed it, do not show the
    # raw tag in chat. Keep only any text before the tag.
    cleaned = re.sub(
        r"<think(?:ing)?>.*$",
        "",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    cleaned = cleaned.strip()
    return cleaned, "\n\n".join(p for p in thought_parts if p)


def _fallback_empty_response(message: str, decision_intent: str = "general") -> str:
    """Last-resort answer so the chat never silently goes blank."""
    msg = re.sub(r"\s+", " ", str(message or "")).strip()
    low = msg.lower()

    if any(w in low for w in ["konusmayi mi unuttun", "konuşmayı mı unuttun", "cevap vermeyi", "cevap yok"]):
        return (
            "Buradayim, konusmayi unutmadim. Az once cevap uretimi takildi; "
            "buradan devam edelim. Ne demek istedigini baglama gore okuyup dogrudan cevap verecegim."
        )
    if any(w in low for w in ["mantik", "mantık", "dusun", "düşün", "leb", "leblebi"]):
        return (
            "Tamam, mantik cercevesinde konusalim. Once ima edilen soruyu cikaracagim, "
            "sonra varsayimlarimi ayirip net sonuca gidecegim. Bu durumda asil konu: "
            "CODEGA AI'nin sadece kelimeye cevap vermesi degil, baglami anlayip insansi tepki vermesi."
        )
    if decision_intent == "implicit_context":
        return (
            "Anladim. Burada dogrudan soru sorulmuyor; benden baglami ve imayi yakalamam bekleniyor. "
            "Bu yuzden cevabi onceki konusmaya gore kurmam gerekiyor."
        )
    return "Buradayim. Cevap uretimi bos dondu, ama sohbeti surduruyorum; son mesajina gore devam edebilirim."


def _project_meta_from_message(message: str) -> tuple[str, str]:
    msg = str(message or "").lower()
    if any(w in msg for w in ["arac", "araç", "kiralama", "rent a car", "rentacar"]):
        return "arac_kiralama", "arac_kiralama_db"
    if "php" in msg:
        return "php_proje", "php_proje_db"
    return "codega_project", "codega_project_db"


def _fold_tr(text: str) -> str:
    """Tiny Turkish normalizer for delivery guards."""
    table = str.maketrans({
        "ı": "i", "İ": "i", "ğ": "g", "Ğ": "g", "ü": "u", "Ü": "u",
        "ş": "s", "Ş": "s", "ö": "o", "Ö": "o", "ç": "c", "Ç": "c",
    })
    return str(text or "").translate(table).lower()


def _looks_like_delivery_request(message: str) -> bool:
    msg = _fold_tr(message)
    artifacts = [
        "zip", "dosya", "dosyalari", "veritabani", "database", "schema", "sql",
        "php", "web sitesi", "web sayfasi", "website", "site", "proje",
        "uygulama", "sistem", "arac", "kiralama", "rent a car", "rentacar",
    ]
    actions = [
        "olustur", "hazirla", "yap", "uret", "ver", "teslim", "indir",
        "paketle", "kodla", "gelistir",
    ]
    if "zip" in msg and any(a in msg for a in ["olustur", "hazirla", "ver", "teslim", "indir", "paketle"]):
        return True
    if "php" in msg and any(a in msg for a in ["veritabani", "database", "sql", "zip", "dosya"]):
        return True
    return any(a in msg for a in artifacts) and any(a in msg for a in actions)


def _looks_like_model_refusal(content: str) -> bool:
    msg = _fold_tr(content)
    refusal_markers = [
        "zip dosyasi olusturamadim",
        "sistemimde bir zip",
        "zip dosyasi olusturam",
        "bunun yerine",
        "stratejik plan",
        "nasil yardimci olabilirim",
        "planlayabiliriz",
        "hangi sayfalarin olusturulacagini",
        "kod dogrudan yazabilme",
        "kod yazma yetenegim yok",
        "dosya olusturma yetenegim yok",
        "yetenegim yok",
        "yetenegim bulunmuyor",
    ]
    return any(marker in msg for marker in refusal_markers)


def _format_project_zip_response(result: dict, db_name: str, source_context: str = "", rescued: bool = False) -> str:
    files = ", ".join(f"`{f}`" for f in result.get("files", [])[:8])
    source_line = "\n- Kaynak sayfa incelendi ve tasarim/fonksiyon yapisi projeye uyarlandi." if source_context else ""
    intro = (
        "Teslim guard devreye girdi; plan/refusal yerine projeyi olusturdum."
        if rescued
        else "Ise koyuldum; yorum yapmak yerine projeyi olusturdum."
    )
    return (
        f"{intro}\n\n"
        f"- Proje: `{result['filename']}`\n"
        f"- Dosya sayisi: {result['file_count']}\n"
        f"- Veritabani: `{db_name}` / `schema.sql` dahil\n"
        f"- Dosyalar: {files}"
        f"{source_line}\n\n"
        f"[ZIP'i indir]({result['download_url']})"
    )


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
    def __init__(self, job_id: str, message: str, chat_id: Optional[int],
                 max_tokens: int, file_context: str = "", deep_think: bool = False):
        self.job_id = job_id
        self.message = message
        self.chat_id = chat_id
        self.max_tokens = max_tokens
        self.file_context = file_context
        self.deep_think = deep_think   # o1/o3 tarzı CoT
        self.thought = ""              # İç düşünce (kullanıcıya gösterilebilir)
        self.message_id: Optional[int] = None
        self.status = "pending"
        self.content = ""
        self.error = ""
        self.progress = "Is siraya alindi"
        self.progress_log: list[str] = []
        self.started_at = time.time()
        self.finished_at: Optional[float] = None
        self._lock = threading.Lock()

    def set_progress(self, message: str) -> None:
        with self._lock:
            self.progress = message
            self.progress_log.append(message)
            self.progress_log = self.progress_log[-8:]

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
                "thought": self.thought,    # Derin düşünme içeriği
                "progress": self.progress,
                "progress_log": list(self.progress_log),
                "message_id": self.message_id,
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
    job.set_progress("Talimat analiz ediliyor")
    try:
        from codegaai.core.engine import LLMEngine, GenerationConfig
        from codegaai.core.system_prompt import build_system_prompt
        from codegaai.core.chat_store import ChatStore
        from codegaai.core.agent_brain import decide_response, decision_guidance

        engine = LLMEngine.get()
        history = []
        if job.chat_id:
            try:
                store = ChatStore.open()
                msgs = store.get_messages(job.chat_id, limit=30)
                for m in msgs:
                    history.append({"role": m["role"], "content": m["content"]})
            except Exception:
                pass

        decision = decide_response(job.message, history=history)
        job.set_progress(f"Niyet algilandi: {decision.intent}")

        if "generate_project" in decision.needs_tools:
            from codegaai.api.routes.files import create_php_project_zip

            source_context = ""
            if re.search(r"https?://|\b[\w.-]+\.(?:com|net|org|com\.tr|tr)\b", job.message, re.IGNORECASE):
                try:
                    job.set_progress("Referans web sayfasi inceleniyor")
                    source_context = await _maybe_web_search(job.message)
                except Exception as exc:
                    log.debug("Proje kaynak URL incelemesi atlandi: %s", exc)
                    job.set_progress("Referans sayfa okunamadi, yerel sablonla devam ediliyor")
            project_name, db_name = _project_meta_from_message(job.message)
            job.set_progress("PHP 8.3 + veritabani dosyalari uretiliyor")
            result = create_php_project_zip(
                job.message,
                project_name=project_name,
                db_name=db_name,
                php_version="8.3",
                source_context=source_context,
            )
            job.set_progress("ZIP paketi hazirlandi")
            job.content = _format_project_zip_response(result, db_name, source_context)
            if job.chat_id:
                try:
                    store = ChatStore.open()
                    store.add_message(job.chat_id, "user", job.message)
                    job.message_id = store.add_message(job.chat_id, "assistant", job.content)
                except Exception:
                    pass
            job.finish()
            log.info("ChatJob %s proje zip hazirlandi: %s", job.job_id, result.get("filename"))
            return

        try:
            job.set_progress("Uygun model seciliyor")
            from codegaai.core.model_router import ModelRouter
            from codegaai.core.models_registry import ModelRegistry

            router = ModelRouter.get()
            target_model = router.select_model(job.message, history=history)
            if target_model:
                job.set_progress(f"Model hazirlaniyor: {target_model}")
                router.switch_model_if_needed(target_model)
            elif not engine.is_ready:
                registry = ModelRegistry.get()
                for model in registry.list_llm_models():
                    if registry.is_llm_downloaded(model["id"]):
                        job.set_progress(f"Model yukleniyor: {model['id']}")
                        engine.load(model["id"])
                        break
        except Exception as exc:
            log.debug("Model routing atlandı: %s", exc)

        if not engine.is_ready:
            job.finish(error="Model yüklü değil. Sistem -> model yükle.")
            return

        web_context = ""
        plugin_result = ""
        # Plugin eşleşmesi — hava/hesap/takvim vb.
        try:
            job.set_progress("Pluginler kontrol ediliyor")
            from codegaai.core.plugin_manager import PluginManager
            pm = PluginManager.get()
            match = pm.match_command(job.message)
            if match:
                pid, meta = match
                plugin_result = pm.execute(pid, job.message)
                log.info("Plugin: %s → %s", meta.name, plugin_result[:60])
        except Exception:
            pass
        try:
            if decision.needs_web:
                job.set_progress("Web aramasi yapiliyor")
                web_context = await _maybe_web_search(job.message)
        except Exception:
            pass

        rag_text = ""
        try:
            job.set_progress("Bellek/RAG taraniyor")
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
        if plugin_result:
            full_context += f"\n\n## Plugin Sonucu\n{plugin_result}"
        if job.file_context:
            full_context += f"\n\n## Yüklenen Dosya İçeriği\n{job.file_context[:8000]}"
        if web_context:
            full_context += f"\n\n## İnternet Araması Sonuçları\n{web_context}"
        if rag_text:
            full_context += f"\n\n## İlgili Bellek\n{rag_text}"

        system_prompt = build_system_prompt(
            include_tools=decision.uses_tools,
            rag_context=full_context,
            agent_guidance=decision_guidance(decision),
        )
        auto_think = bool(job.deep_think or decision.needs_careful_reasoning)
        if auto_think and not job.deep_think:
            system_prompt += (
                "\n\n## Otomatik Akil Yurutme\n"
                "Cevap vermeden once yalnizca icinden kisa analiz yap: kullanici aslinda ne soruyor, "
                "onceki mesajdaki ima ne, en dogal cevap ne? "
                "Ilk yazdigin karakter final cevabin olsun. "
                "Kesinlikle <think>, <thinking>, analiz notu veya ic dusunce blogu yazma; sadece sonuc cevabi ver."
            )

        # ── Derin Düşünme (o1/o3 modu) ───────────────────────────────
        if job.deep_think:
            job.set_progress("Derin dusunme ile cevap uretiliyor")
            think_prompt = system_prompt + """

## Derin Düşünme Modu AKTİF

Yanıt vermeden önce <think> bloğu içinde adım adım düşün:
<think>
1. Soruyu analiz et — ne tam olarak soruluyor?
2. Hangi bilgilere ihtiyacım var?
3. Çözüm yaklaşımım nedir?
4. Olası hatalar ve edge case'ler?
5. En iyi yanıt nasıl olmalı?
</think>

Düşünce sonrası net ve doğrudan yanıt ver."""
            messages = [{"role": "system", "content": think_prompt}]
            messages.extend(history)
            messages.append({"role": "user", "content": job.message})
            # Düşünceyi ayır
            full_out = ""
            for token in engine.stream(messages, cfg=GenerationConfig(
                    max_tokens=job.max_tokens + 512, temperature=0.4)):
                full_out += token
            # <think>...</think> bloğunu ayıkla
            import re as _re
            think_match = _re.search(r'<think>(.*?)</think>', full_out, _re.DOTALL)
            if think_match:
                job.thought = think_match.group(1).strip()
                answer = _re.sub(r'<think>.*?</think>', '', full_out, flags=_re.DOTALL).strip()
                job.append(answer)
            else:
                job.append(full_out)
        # ── Normal mod ────────────────────────────────────────────────
        else:
            messages = [{"role": "system", "content": system_prompt}]
            messages.extend(history)
            messages.append({"role": "user", "content": job.message})

        if job.chat_id:
            try:
                store = ChatStore.open()
                store.add_message(job.chat_id, "user", job.message)
            except Exception:
                pass

        if not job.deep_think:  # deep_think zaten yukarıda üretildi
            cfg = GenerationConfig(max_tokens=job.max_tokens, temperature=0.55)
            if decision.should_stream:
                job.set_progress("Cevap akisi basladi")
                for token in engine.stream(messages, cfg=cfg):
                    job.append(token)
            else:
                job.set_progress("Aracli cevap uretiliyor")
                result = engine.generate(messages, cfg=cfg, use_tools=True)
                job.append(result.get("content", ""))

        # Local modeller bazen talimata ragmen dusunce etiketlerini sizdirir.
        # Kullaniciya ic analiz degil, temiz final cevap gosterilir.
        cleaned, leaked_thought = _clean_visible_answer(job.content)
        if leaked_thought and not job.thought:
            job.thought = leaked_thought
        if cleaned != job.content.strip():
            with job._lock:
                job.content = cleaned
        if not job.content.strip():
            with job._lock:
                job.content = _fallback_empty_response(job.message, decision.intent)
        if _looks_like_delivery_request(job.message) and _looks_like_model_refusal(job.content):
            try:
                from codegaai.api.routes.files import create_php_project_zip

                source_context = ""
                if re.search(r"https?://|\b[\w.-]+\.(?:com|net|org|com\.tr|tr)\b", job.message, re.IGNORECASE):
                    try:
                        job.set_progress("Teslim guard: referans sayfa inceleniyor")
                        source_context = await _maybe_web_search(job.message)
                    except Exception as exc:
                        log.debug("Teslim guard kaynak incelemesi atlandi: %s", exc)
                project_name, db_name = _project_meta_from_message(job.message)
                job.set_progress("Teslim guard: ZIP dosyalari uretiliyor")
                result = create_php_project_zip(
                    job.message,
                    project_name=project_name,
                    db_name=db_name,
                    php_version="8.3",
                    source_context=source_context,
                )
                with job._lock:
                    job.content = _format_project_zip_response(
                        result,
                        db_name,
                        source_context,
                        rescued=True,
                    )
                job.set_progress("Teslim guard: ZIP paketi hazirlandi")
                log.info("ChatJob %s teslim guard proje zip hazirladi: %s", job.job_id, result.get("filename"))
            except Exception as exc:
                log.warning("Teslim guard proje uretimi basarisiz: %s", exc)
        job.set_progress("Cevap tamamlandi")

        if job.chat_id and job.content:
            try:
                store = ChatStore.open()
                job.message_id = store.add_message(
                    job.chat_id, "assistant", job.content
                )
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
    file_context: str = ""
    deep_think: bool = False   # o1/o3 modu — yanıt vermeden önce düşün


@router.post("/chat")
async def start_chat_job(req: ChatJobRequest) -> dict:
    job_id = str(uuid.uuid4())[:8]
    job = ChatJob(
        job_id=job_id,
        message=req.message,
        chat_id=req.chat_id,
        max_tokens=req.max_tokens,
        file_context=req.file_context,
        deep_think=req.deep_think,
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
