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


def _learn_from_chat(question: str, answer: str, intent: str) -> None:
    """
    Sohbetten Ã¶ÄŸren â€” yeterince uzun ve bilgi dolu yanÄ±tlarÄ± RAG'a ekle.
    KÄ±sa/genel yanÄ±tlarÄ± atla (belleÄŸi kirletme).
    """
    if len(answer) < 150:  # Ã‡ok kÄ±sa â†’ kaydetme
        return
    if intent not in ("coding", "calculation", "general"):
        return
    try:
        from codegaai.core.memory import MemoryStore
        from codegaai.core.embeddings import EmbeddingService
        if not EmbeddingService.get().is_ready:
            return
        mem = MemoryStore.open()
        import time
        mem.add(
            text=f"S: {question[:200]}\nC: {answer[:600]}",
            metadata={
                "source": "chat_learning",
                "intent": intent,
                "learned_at": time.time(),
                "title": question[:80],
            },
        )
    except Exception:
        pass


_WEB_REQUIRED_PATTERNS = [
    r"https?://",
    r"\b(site|web\s*site|internet|google|duckduckgo|haber|news)\b",
    r"\b(ara|arat|bul|bak|ziyaret et|search|find|visit|browse|araÅŸtÄ±r|arastir|gez)\b",
    r"\b(en son|son dakika|bugÃ¼n|bugun|gÃ¼ncel haber|latest|current|ÅŸu an|simdi)\b",
    r"\b20[2-9][0-9]\b",
]

# Explicit web command patterns â€” bu varsa SELF-REF olsa bile web search yap
_WEB_EXPLICIT_PATTERNS = [
    r"\bziyaret\s+et\b",
    r"\baraÅŸtÄ±r\b|\barastir\b",
    r"\binternett?en\s+(ara|bul|bak|Ã¶ÄŸren)\b",
    r"\bweb('?de|den)\s+(ara|bul|bak)\b",
    r"\b(ara\s+ve|bul\s+ve|bak\s+ve|gez\s+ve)\b",  # "ara ve getir/sÃ¶yle/anlat"
    r"\barama\s+yap\b",
    r"\bonline\s+(ara|bul|bak)\b",
    r"\bgÃ¼ncel(le|i)?\b",
    r"\bne\s+oldu\b",   # "ne oldu" â†’ gÃ¼ncel bilgi
]

# Genel entity / "X hakkÄ±nda bilgi" patterns â€” sÄ±kÄ±: en az 2 kelimeli proper noun
# veya aÃ§Ä±k kategori (ÅŸirket/firma/holding) ile birlikte
_ENTITY_INFO_PATTERNS = [
    # Ã‡ift bÃ¼yÃ¼k harfli isim + bilgi sorusu (Ã¶rn: "Tekcan Metal hakkÄ±nda")
    r"\b[A-ZÅÄÃœÃ‡Ã–Ä°][a-zÅŸÄŸÃ¼Ã§Ã¶Ä±]{2,}\s+[A-ZÅÄÃœÃ‡Ã–Ä°][a-zÅŸÄŸÃ¼Ã§Ã¶Ä±]{2,}.{0,40}(hakk[Ä±i]nda|nedir|kimdir|nas[Ä±i]l)",
    # AÃ§Ä±k kategori + isim
    r"\b(ÅŸirket|firma|company|fabrika|holding|grup)\s+[A-Za-zÅÄÃœÃ‡Ã–Ä°ÅŸÄŸÃ¼Ã§Ã¶Ä±]{3,}",
]

# Genel "selam" ve sosyal sorular â€” web search YAPMA
_SOCIAL_PATTERNS = [
    r"^\s*(merhaba|selam|hi|hello|hey|gÃ¼naydÄ±n|iyi (akÅŸam|akÅŸamlar|gece|geceler)|nasÄ±lsÄ±n|naber)",
    r"^\s*(teÅŸekkÃ¼r|saÄŸol|sagol|tamam|ok|peki)",
]

_SELF_REFERENCE_PATTERNS = [
    # CODEGA AI'nin kendisi hakkÄ±nda â€” "sen ziyaret et" gibi komutlar HARÄ°Ã‡
    r"\b(kendin(den|i)|cevabÄ±n|cevabin|seni\s+(yapan|geliÅŸtiren|kim))\b",
    r"\b(neler\s+yapabilirsin|Ã¶zelliklerin|yeteneklerin)\b",
    r"\b(codega\s+(ai|nedir|kim))\b",
    r"\b(codex|code\s*x|claude|gemini|chatgpt|gpt)\b",
]


def _looks_self_referential(message: str) -> bool:
    msg = message.lower()
    return any(re.search(p, msg, re.IGNORECASE) for p in _SELF_REFERENCE_PATTERNS)


def _is_social_chat(message: str) -> bool:
    msg = message.lower()
    return any(re.search(p, msg, re.IGNORECASE) for p in _SOCIAL_PATTERNS)


def _quick_social_response(message: str) -> str:
    """Very short social turns should never wait for a local model."""
    from datetime import datetime

    msg = message.lower().strip()
    hour = datetime.now().hour
    if "gÃ¼naydÄ±n" in msg:
        greeting = "GÃ¼naydÄ±n"
    elif "iyi gece" in msg:
        greeting = "Ä°yi geceler"
    elif "iyi akÅŸam" in msg:
        greeting = "Ä°yi akÅŸamlar"
    elif "teÅŸekkÃ¼r" in msg or "saÄŸol" in msg or "sagol" in msg:
        return "Rica ederim. BuradayÄ±m, devam edebiliriz."
    elif "nasÄ±lsÄ±n" in msg or "naber" in msg:
        return "Ä°yiyim, teÅŸekkÃ¼r ederim. Senin iÃ§in neyi hÄ±zla Ã§Ã¶zelim?"
    elif 5 <= hour < 12:
        greeting = "GÃ¼naydÄ±n"
    elif 18 <= hour < 23:
        greeting = "Ä°yi akÅŸamlar"
    elif hour >= 23 or hour < 5:
        greeting = "Ä°yi geceler"
    else:
        greeting = "Merhaba"
    return f"{greeting}. BuradayÄ±m, nasÄ±l yardÄ±mcÄ± olayÄ±m?"


def _quick_capability_response(message: str) -> str:
    msg = message.lower().strip()
    if any(k in msg for k in ["internet", "web", "arama", "araÅŸtÄ±r", "arastir"]):
        return (
            "Evet. GÃ¼ncel bilgi gerektiÄŸinde internet aramasÄ±nÄ± otomatik kullanÄ±rÄ±m; "
            "sen sadece neyi Ã¶ÄŸrenmek istediÄŸini yaz."
        )
    if any(k in msg for k in ["resim", "gÃ¶rsel", "gorsel", "image", "Ã§iz", "ciz"]):
        return (
            "Evet. Resim veya gÃ¶rsel istediÄŸinde komutunu otomatik gÃ¶rsel Ã¼retim motoruna yÃ¶nlendiririm."
        )
    if any(k in msg for k in ["kod", "yazÄ±lÄ±m", "yazilim", "debug", "hata"]):
        return (
            "Evet. Kod yazma, hata Ã§Ã¶zme, repo inceleme ve test Ã¼retme iÅŸlerinde kod moduna otomatik geÃ§erim."
        )
    return ""


def _needs_web_search(message: str) -> bool:
    msg = message.lower()

    # 0. Sosyal mesaj (selam, teÅŸekkÃ¼r) â†’ web search asla
    if _is_social_chat(msg) and len(msg) < 50:
        return False

    # 1. Explicit web komutlarÄ± her durumda True (self-ref check'i bypass)
    for p in _WEB_EXPLICIT_PATTERNS:
        if re.search(p, msg, re.IGNORECASE):
            return True

    # 2. Entity aramasÄ± (Ã‡ok kelimeli proper noun + bilgi sorusu)
    for p in _ENTITY_INFO_PATTERNS:
        if re.search(p, message):   # case-sensitive: proper noun
            return True

    # 3. Self-referential ise (CODEGA AI'nin kendisi hakkÄ±nda) ve explicit web yoksa â†’ False
    if _looks_self_referential(msg):
        return False

    # 4. Genel web triggers
    return any(re.search(p, msg, re.IGNORECASE) for p in _WEB_REQUIRED_PATTERNS)


async def _execute_inline_tools(content: str, job) -> str:
    """
    <tool>tool_name(args)</tool> bloklarÄ±nÄ± Ã§alÄ±ÅŸtÄ±r, sonucu yerine koy.
    Basit prompt-injection-safe pattern.
    """
    import re
    
    pattern = re.compile(r"<tool>(.*?)</tool>", re.DOTALL)
    
    def _safe_call(match):
        tool_call = match.group(1).strip()
        try:
            # Sadece gÃ¼venli, beyaz listede olan tool'lar
            if tool_call.startswith("search("):
                query = tool_call[7:-1].strip().strip('"\'')
                from codegaai.core.web_search import web_search
                results = web_search(query, limit=3)
                return "\n[Arama sonuÃ§larÄ±]\n" + "\n".join(
                    f"- {r.get('title', '')}: {r.get('snippet', '')[:150]}"
                    for r in results
                ) + "\n"
            elif tool_call.startswith("calc("):
                expr = tool_call[5:-1].strip()
                # Sadece sayÄ±sal ifadeler
                if re.match(r"^[\d\s+\-*/().]+$", expr):
                    return f" {eval(expr)} "  # noqa: S307 - kÄ±sÄ±tlÄ± eval
            elif tool_call.startswith("time()"):
                from datetime import datetime
                return f" {datetime.now().strftime('%H:%M, %d %B %Y')} "
            return match.group(0)   # Bilinmeyen tool â†’ olduÄŸu gibi bÄ±rak
        except Exception as e:
            return f"[Tool hatasÄ±: {e}]"
    
    try:
        return pattern.sub(_safe_call, content)
    except Exception:
        return content


def _update_profile_async(messages: list[dict]) -> None:
    """
    KullanÄ±cÄ± profilini arka planda gÃ¼ncelle (engellemez, hata vermez).
    Sohbetten ilgi alanlarÄ±, Ã¼slup tercihleri Ã§Ä±kartÄ±r.
    """
    try:
        import threading
        
        def _run():
            try:
                from codegaai.core.user_profile import UserProfile
                profile = UserProfile.get()
                profile.update_from_messages(messages)
            except (ImportError, AttributeError):
                # UserProfile modÃ¼lÃ¼ yoksa sessizce atla
                pass
            except Exception as e:
                log.debug("Profil gÃ¼ncellemesi atlandÄ±: %s", e)
        
        threading.Thread(target=_run, daemon=True).start()
    except Exception:
        pass   # HiÃ§bir koÅŸulda chat akÄ±ÅŸÄ±nÄ± bozma


def _needs_retry(question: str, answer: str) -> bool:
    """
    Self-eval: yanÄ±t yetersizse True dÃ¶n.

    Kriterler:
    - Ã‡ok kÄ±sa (< 15 karakter)
    - Belirsiz/kaÃ§amak ifadeler ('bilmiyorum', 'Ã¼zgÃ¼nÃ¼m' tek baÅŸÄ±na)
    - Hata mesajÄ± iÃ§eriyor
    - Sadece soruyu tekrarlÄ±yor
    - YASAK kalÄ±plar (CODEGA AI tarzÄ± yanÄ±t iÃ§in engelleme)
    """
    if not answer or not answer.strip():
        return True

    ans = answer.strip().lower()

    # Ã‡ok kÄ±sa cevaplar (genellikle yetersiz)
    if len(ans) < 15:
        return True

    # YASAK kalÄ±plar â€” CODEGA AI tarzÄ± iÃ§in engellenir
    # Bu kalÄ±plardan biri varsa MUTLAKA retry
    forbidden_patterns = [
        "doÄŸrudan internet Ã¼zerinde gezinem",   # gezinemem / gezinemiyorum
        "internet Ã¼zerinde doÄŸrudan gezinem",
        "internete doÄŸrudan eriÅŸim",
        "internete eriÅŸim",                      # "yok" devamÄ± olsa da olmasa da
        "web'e eriÅŸim",
        "web e eriÅŸim",
        "internete baÄŸlanam",
        "ben bir yapay zeka asistanÄ±yÄ±m",
        "ben bir yapay zekayÄ±m",
        "ben bir yapay zeka modeliyim",
        "ben sadece bir yapay zeka",
        "gerÃ§ek zamanlÄ± veri saÄŸla",
        "gerÃ§ek zamanlÄ± bilgi saÄŸla",
        "bilgilerim 2023",
        "bilgilerim 2024",
        "bilgilerim 2025",
        "knowledge cutoff",
        "training data",
        "Ã¶ncelikle belirtmeliyim",
        "maalesef, ",
        "maalesef bu konuda",
        "Ã¼zgÃ¼nÃ¼m, ancak",
        "Ã¼zgÃ¼nÃ¼m, ben bir",
        "Ã¼zgÃ¼nÃ¼m, doÄŸrudan",
        "as an ai language model",
        "as an ai assistant",
        "i cannot browse",
        "i don't have access to",
        "i don't have the ability",
        "tarayÄ±cÄ± kullanma yeteneÄŸim yok",
        "gezinme yeteneÄŸim yok",
        "tarayÄ±cÄ± yeteneÄŸim yok",
    ]
    for pattern in forbidden_patterns:
        if pattern in ans:
            return True

    # KaÃ§amak/yetersiz ifade kalÄ±plarÄ± (kÄ±sa cevap + zayÄ±f ifade)
    weak_patterns = [
        "bilmiyorum",
        "yardÄ±mcÄ± olamam",
        "anlayamadÄ±m",
        "hata: name",
        "hata: '",
        "is not defined",
        "name error",
        "traceback",
    ]
    weak_count = sum(1 for p in weak_patterns if p in ans)
    if weak_count >= 1 and len(ans) < 100:
        return True

    # Cevap soruyu aynen tekrarlÄ±yorsa
    q = question.strip().lower()
    if q and len(q) > 10 and ans.startswith(q):
        return True

    return False


def _clean_final_content(content: str) -> str:
    try:
        from codegaai.core.answer_sanitizer import sanitize_final_answer
        return sanitize_final_answer(content)
    except Exception:
        return str(content or "").strip()


def _fallback_empty_response(message: str, decision_intent: str = "general") -> str:
    if decision_intent == "architecture_planning":
        try:
            from codegaai.core.answer_sanitizer import architecture_plan_fallback
            return architecture_plan_fallback(message)
        except Exception:
            return "# Analysis\nMevcut proje dogrulanamadi.\n\n# Assumptions\nLaravel, Flutter, MySQL ve Laravel Sanctum kullanilacak."
    return "Buradayim. Cevap uretimi bos dondu, ama sohbeti surduruyorum; son mesajina gore devam edebilirim."


def _build_recent_focus(history: list[dict], latest: str) -> str:
    recent = history[-6:]
    if not recent:
        return ""

    lines = []
    for item in recent:
        role = "KullanÄ±cÄ±" if item.get("role") == "user" else "Asistan"
        content = re.sub(r"\s+", " ", str(item.get("content", ""))).strip()
        if content:
            lines.append(f"- {role}: {content[:240]}")
    if not lines:
        return ""

    return (
        "## Son Sohbet OdaÄŸÄ±\n"
        + "\n".join(lines)
        + f"\n- KullanÄ±cÄ±nÄ±n son mesajÄ±: {latest[:300]}\n\n"
        "Bu son mesajÄ± yukarÄ±daki baÄŸlama gÃ¶re yanÄ±tla. KullanÄ±cÄ± 'sen/senden/seni' diyorsa "
        "CODEGA AI'yi kastettiÄŸini varsay. Konuyu Windows, haber veya baÅŸka alana kaydÄ±rma."
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
            async with httpx.AsyncClient(timeout=5.0) as client:    # 8â†’5 sn
                r = await client.get(url, headers=headers, follow_redirects=True)
                text = re.sub(r"<[^>]+>", " ", r.text[:2000])       # 3000â†’2000
                text = re.sub(r"\s+", " ", text).strip()
                return f"[{url}]\n{text[:1500]}"                    # 2000â†’1500
        except Exception as exc:
            log.debug("URL okuma hatasÄ±: %s", exc)

    try:
        query = message.strip()
        async with httpx.AsyncClient(timeout=5.0) as client:        # 8â†’5 sn
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
            return f"[Web AramasÄ±: {query}]\n{text[:1200]}"         # 1500â†’1200

        results = []
        # Sadece ilk 3 sonuÃ§ (eskiden 5) â€” daha az context, daha hÄ±zlÄ± LLM
        for i, (title, snippet) in enumerate(zip(titles, snippets)):
            title_clean = re.sub(r"<[^>]+>", "", title).strip()
            snippet_clean = re.sub(r"<[^>]+>", "", snippet).strip()
            results.append(f"{i + 1}. {title_clean}: {snippet_clean[:200]}")
            if i >= 2:    # 0,1,2 = 3 sonuÃ§ (eski 5)
                break
        return f"[Web AramasÄ±: {query}]\n" + "\n".join(results)
    except Exception as exc:
        log.debug("Web aramasÄ± hatasÄ±: %s", exc)
        return ""


def _maybe_deliver_artifact(message: str, history: list[dict]) -> Optional[str]:
    """
    Acik proje/dosya/ZIP taleplerinde modeli beklemeden somut teslim uret.

    Bu katman, yerel LLM'in "plan anlatma" veya "ZIP olusturamam" gibi eski
    chatbot davranisina kacmasini engeller. Once calisan dosyalar, sonra cevap.
    """
    try:
        from codegaai.core.action_delivery import build_delivery_artifact
        artifact = build_delivery_artifact(message, history)
        if not artifact:
            return None

        from codegaai.api.routes.files import _make_zip, _zip_store, _cleanup

        data = _make_zip(artifact.project_name, artifact.files)
        zid = str(uuid.uuid4())[:8]
        filename = f"{artifact.project_name}.zip"
        _zip_store[zid] = {"data": data, "filename": filename, "ts": time.time()}
        _cleanup(_zip_store)

        files = "\n".join(f"- `{name}`" for name in artifact.files.keys())
        return (
            f"{artifact.title} hazir.\n\n"
            f"ZIP: [**{filename} indir**](/api/files/download/{zid}?filename={filename})\n\n"
            f"Icerik:\n{files}\n\n"
            "Icinde veritabani semasi, PHP dosyalari, stil dosyasi ve kurulum notlari var."
        )
    except Exception as exc:
        log.warning("Teslim uretimi atlandi: %s", exc)
        return None


class ChatJob:
    def __init__(self, job_id: str, message: str, chat_id: Optional[int],
                 max_tokens: int, file_context: str = "", deep_think: bool = False,
                 speed_mode: bool = True):
        self.job_id = job_id
        self.message = message
        self.chat_id = chat_id
        self.max_tokens = max_tokens
        self.file_context = file_context
        self.speed_mode = speed_mode
        self.deep_think = deep_think   # o1/o3 tarzÄ± CoT
        self.thought = ""              # Ä°Ã§ dÃ¼ÅŸÃ¼nce (kullanÄ±cÄ±ya gÃ¶sterilebilir)
        self.status = "pending"
        self.stage = ""                # AnlÄ±k aÅŸama: searching, retrieving, generating
        self.content = ""
        self.error = ""
        self.started_at = time.time()
        self.finished_at: Optional[float] = None
        self._lock = threading.Lock()

    def set_stage(self, stage: str) -> None:
        """AnlÄ±k aÅŸama bildirimi (UI'da kullanÄ±cÄ±ya gÃ¶ster)."""
        with self._lock:
            self.stage = stage

    def append(self, token: str) -> None:
        with self._lock:
            self.content += token

    def finish(self, error: str = "") -> None:
        with self._lock:
            self.status = "error" if error else "done"
            self.error = error
            self.stage = ""
            self.finished_at = time.time()

    def to_dict(self) -> dict:
        with self._lock:
            elapsed = (self.finished_at or time.time()) - self.started_at
            return {
                "job_id": self.job_id,
                "status": self.status,
                "stage": self.stage,
                "content": self.content,
                "thought": self.thought,    # Derin dÃ¼ÅŸÃ¼nme iÃ§eriÄŸi
                "speed_mode": self.speed_mode,
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
        from codegaai.core.agent_brain import decide_response, decision_guidance

        msg_len = len(job.message.strip())

        engine = LLMEngine.get()
        history = []
        if job.chat_id:
            try:
                store = ChatStore.open()
                msgs = store.get_messages(job.chat_id, limit=8 if job.speed_mode else 30)
                for m in msgs:
                    history.append({"role": m["role"], "content": m["content"]})
            except Exception:
                pass

        if _is_social_chat(job.message) and msg_len < 60:
            if job.chat_id:
                try:
                    store = ChatStore.open()
                    store.add_message(job.chat_id, "user", job.message)
                except Exception:
                    pass
            answer = _quick_social_response(job.message)
            job.append(answer)
            if job.chat_id:
                try:
                    store = ChatStore.open()
                    store.add_message(job.chat_id, "assistant", answer)
                except Exception:
                    pass
            job.finish()
            return

        capability = _quick_capability_response(job.message)
        if capability and msg_len < 120 and any(k in job.message.lower() for k in ["yapabilir", "edebilir", "mÄ±sÄ±n", "misin", "musun", "mÃ¼sÃ¼n"]):
            if job.chat_id:
                try:
                    store = ChatStore.open()
                    store.add_message(job.chat_id, "user", job.message)
                except Exception:
                    pass
            job.append(capability)
            if job.chat_id:
                try:
                    store = ChatStore.open()
                    store.add_message(job.chat_id, "assistant", capability)
                except Exception:
                    pass
            job.finish()
            return

        job.set_stage("Dosya hazirligi kontrol ediliyor...")
        delivery = _maybe_deliver_artifact(job.message, history)
        job.set_stage("")
        if delivery:
            if job.chat_id:
                try:
                    store = ChatStore.open()
                    store.add_message(job.chat_id, "user", job.message)
                except Exception:
                    pass
            job.append(delivery)
            if job.chat_id:
                try:
                    store = ChatStore.open()
                    store.add_message(job.chat_id, "assistant", delivery)
                except Exception:
                    pass
            job.finish()
            log.info("ChatJob %s artifact teslim etti", job.job_id)
            return

        decision = decide_response(job.message, history=history)
        if decision.intent == "architecture_planning":
            job.max_tokens = max(job.max_tokens, 4096)
            job.speed_mode = False
        else:
            if job.speed_mode and not job.deep_think:
                job.max_tokens = min(job.max_tokens, 384)
            if msg_len < 30:
                job.max_tokens = min(job.max_tokens, 96 if job.speed_mode else 128)
            elif msg_len < 80:
                job.max_tokens = min(job.max_tokens, 192 if job.speed_mode else 256)

        try:
            from codegaai.core.model_router import ModelRouter
            from codegaai.core.models_registry import ModelRegistry

            router = ModelRouter.get()
            registry = ModelRegistry.get()
            from codegaai.core.device_model_policy import detect_device_profile, recommend_llm_model

            target_model = None
            downloaded_ids = {
                m["id"] for m in registry.list_llm_models()
                if registry.is_llm_downloaded(m["id"])
            }
            if job.speed_mode and not job.deep_think:
                target_model = recommend_llm_model(
                    detect_device_profile(),
                    downloaded_ids,
                    task=decision.intent,
                ).model_id
            else:
                target_model = router.select_model(job.message, history=history)
                if not target_model and downloaded_ids:
                    target_model = recommend_llm_model(
                        detect_device_profile(),
                        downloaded_ids,
                        task=decision.intent,
                    ).model_id
            if target_model:
                if engine.is_ready and engine.status.get("model_id") != target_model:
                    log.debug("Model geÃ§iÅŸi arka plana bÄ±rakÄ±ldÄ±: %s", target_model)
                elif not engine.is_ready and target_model in downloaded_ids:
                    from codegaai.core.model_warmup import warm_model_async
                    warm_model_async(target_model)
            elif not engine.is_ready:
                rec = recommend_llm_model(detect_device_profile(), downloaded_ids, task=decision.intent)
                if rec.model_id in downloaded_ids:
                    from codegaai.core.model_warmup import warm_model_async
                    warm_model_async(rec.model_id)
        except Exception as exc:
            log.debug("Model routing atlandÄ±: %s", exc)

        if not engine.is_ready:
            # â”€â”€â”€ SimÃ¼lasyon Modu (Faz 57) â”€â”€â”€
            # LLM yok ama uygulama kullanÄ±labilir kalsÄ±n
            try:
                from codegaai.core.simulation_mode import simulate_chat_response
                sim = simulate_chat_response(job.message, history)
                job.append(sim["content"])
                job.finish()
                log.info("SimÃ¼lasyon modu yanÄ±t verdi (LLM yÃ¼klÃ¼ deÄŸil)")
                return
            except Exception as sim_exc:
                log.warning("SimÃ¼lasyon modu baÅŸarÄ±sÄ±z: %s", sim_exc)
                job.finish(error="Model yÃ¼klÃ¼ deÄŸil. Sistem â†’ Otomatik Onar ile dÃ¼zeltebilirsin.")
                return

        web_context = ""
        plugin_result = ""
        # Plugin eÅŸleÅŸmesi â€” hava/hesap/takvim vb.
        try:
            from codegaai.core.plugin_manager import PluginManager
            pm = PluginManager.get()
            match = pm.match_command(job.message)
            if match:
                pid, meta = match
                plugin_result = pm.execute(pid, job.message)
                log.info("Plugin: %s â†’ %s", meta.name, plugin_result[:60])
        except Exception:
            pass
        try:
            if decision.needs_web:
                job.set_stage("ğŸ” Ä°nternette aranÄ±yor...")
                web_context = await _maybe_web_search(job.message)
                job.set_stage("")
        except Exception:
            job.set_stage("")

        rag_text = ""
        try:
            from codegaai.core.memory import MemoryStore
            from codegaai.core.embeddings import EmbeddingService
            if EmbeddingService.get().is_ready:
                mem = MemoryStore.open()
                # Daha zengin RAG: son mesaj + Ã¶nceki 2 mesajÄ± birleÅŸtir
                rag_query = job.message
                if history:
                    prev = " ".join(
                        m["content"][:120]
                        for m in history[-3:]
                        if m.get("role") == "user"
                    )
                    if prev:
                        rag_query = f"{prev} {job.message}"

                hits = mem.search(rag_query, n_results=2 if job.speed_mode else 5)
                if hits:
                    # Skorla sÄ±rala, en alakalÄ± 3'Ã¼ al
                    top = sorted(hits, key=lambda h: h.get("score", 0), reverse=True)[:1 if job.speed_mode else 3]
                    rag_text = "\n---\n".join(
                        f"[{h.get('metadata', {}).get('title', 'Bellek')}]\n{h.get('text', '')[:400]}"
                        for h in top
                    )
        except Exception:
            pass

        full_context = _build_recent_focus(history, job.message)
        if plugin_result:
            full_context += f"\n\n## Plugin Sonucu\n{plugin_result}"
        if job.file_context:
            full_context += f"\n\n## YÃ¼klenen Dosya Ä°Ã§eriÄŸi\n{job.file_context[:8000]}"
        if web_context:
            full_context += f"\n\n## Ä°nternet AramasÄ± SonuÃ§larÄ±\n{web_context}"

        system_prompt = build_system_prompt(
            include_tools=decision.uses_tools,
            include_profile=True,              # â† kullanÄ±cÄ± profili dahil
            rag_context=rag_text,              # â† sadece RAG, diÄŸerleri ayrÄ±
            agent_guidance=decision_guidance(decision),
            intent=decision.intent,            # â† coding/calculation/general
            deep_think=job.deep_think,
        )

        # â”€â”€ Mesaj listesi oluÅŸtur + Context SÄ±kÄ±ÅŸtÄ±rma â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if job.deep_think:
            think_prompt = system_prompt + """

## Derin DÃ¼ÅŸÃ¼nme Modu AKTÄ°F
YanÄ±t vermeden Ã¶nce <think> bloÄŸu iÃ§inde adÄ±m adÄ±m dÃ¼ÅŸÃ¼n:
<think>
1. Soruyu analiz et
2. Hangi bilgilere ihtiyacÄ±m var?
3. Ã‡Ã¶zÃ¼m yaklaÅŸÄ±mÄ±m nedir?
4. OlasÄ± hatalar?
5. En iyi yanÄ±t nasÄ±l olmalÄ±?
</think>
DÃ¼ÅŸÃ¼nce sonrasÄ± net ve doÄŸrudan yanÄ±t ver."""
            raw_messages = [{"role": "system", "content": think_prompt}]
        else:
            raw_messages = [{"role": "system", "content": system_prompt}]

        raw_messages.extend(history)
        raw_messages.append({"role": "user", "content": job.message})

        # Context sÄ±kÄ±ÅŸtÄ±rma â€” token limiti aÅŸÄ±lacaksa Ã¶nceki mesajlarÄ± Ã¶zetle
        try:
            from codegaai.core.context_manager import ContextManager
            ctx = ContextManager()
            result_ctx = ctx.prepare_context(raw_messages, system_prompt)
            messages = result_ctx.messages
            if result_ctx.was_compressed:
                log.info("Context sÄ±kÄ±ÅŸtÄ±rÄ±ldÄ±: %dâ†’%d mesaj",
                         len(raw_messages), len(messages))
        except Exception:
            messages = raw_messages

        if job.chat_id:
            try:
                store = ChatStore.open()
                store.add_message(job.chat_id, "user", job.message)
            except Exception:
                pass

        if not job.deep_think:
            cfg = GenerationConfig(max_tokens=job.max_tokens, temperature=0.55)
            if decision.should_stream:
                for token in engine.stream(messages, cfg=cfg):
                    job.append(token)
            else:
                result = engine.generate_agentic(messages, cfg=cfg, max_iters=3)
                job.append(result.get("content", ""))
        else:
            full_out = ""
            for token in engine.stream(messages, cfg=GenerationConfig(
                    max_tokens=job.max_tokens + 512, temperature=0.4)):
                full_out += token
            import re as _re
            think_match = _re.search(r'<think>(.*?)</think>', full_out, _re.DOTALL)
            if think_match:
                job.thought = think_match.group(1).strip()
                answer = _re.sub(r'<think>.*?</think>', '', full_out, flags=_re.DOTALL).strip()
                job.append(answer)
            else:
                job.append(full_out)

        # â”€â”€ Tool Calling â€” <tool>...</tool> bloklarÄ±nÄ± Ã§alÄ±ÅŸtÄ±r â”€â”€â”€â”€â”€â”€â”€
        if job.content and "<tool>" in job.content:
            job.content = await _execute_inline_tools(job.content, job)

        # â”€â”€ Self-Evaluation â€” KÄ±sa/belirsiz yanÄ±tlarÄ± yeniden yaz â”€â”€â”€â”€
        if (not job.speed_mode) and _needs_retry(job.message, job.content):
            log.info("Self-eval: yanÄ±t yetersiz, yeniden Ã¼retiliyor")
            job.set_stage("âœï¸ YanÄ±t iyileÅŸtiriliyor...")

            # Sert yeniden yazma talimatÄ± â€” CODEGA AI tarzÄ±
            retry_instruction = (
                "Bir Ã¶nceki yanÄ±t YETERSÄ°Z veya yasak kalÄ±p iÃ§eriyor. Åu kurallarÄ± uygula:\n"
                "1. 'Ben yapay zeka asistanÄ±yÄ±m', 'internet Ã¼zerinde gezinemiyorum' "
                "gibi kalÄ±plarÄ± KULLANMA.\n"
                "2. EÄŸer kullanÄ±cÄ±nÄ±n sorusunu cevaplayabilmek iÃ§in web bilgisine "
                "ihtiyacÄ±n varsa, bu mesaj geldikten sonra backend zaten web aramasÄ± "
                "yapacak â€” sen sadece sentezle.\n"
                "3. Bilmiyorsan 'Hemen araÅŸtÄ±rÄ±yorum' de â€” ASLA pes etme.\n"
                "4. CODEGA AI gibi cevapla: doÄŸrudan, net, yardÄ±msever, dolgusuz.\n\n"
                "Åimdi soruyu YENÄ°DEN cevapla:\n\n"
                f"Soru: {job.message}"
            )

            retry_msgs = messages + [
                {"role": "assistant", "content": job.content},
                {"role": "user", "content": retry_instruction},
            ]
            job.content = ""
            for token in engine.stream(retry_msgs, cfg=GenerationConfig(
                    max_tokens=job.max_tokens, temperature=0.4)):
                job.append(token)
            job.set_stage("")

        job.content = _clean_final_content(job.content)
        if not job.content.strip():
            job.content = _fallback_empty_response(job.message, decision.intent)

        if job.chat_id and job.content:
            try:
                store = ChatStore.open()
                store.add_message(job.chat_id, "assistant", job.content)
            except Exception:
                pass

        # â”€â”€ Sohbetten Ã¶ÄŸren â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        _learn_from_chat(job.message, job.content, decision.intent)

        # â”€â”€ KullanÄ±cÄ± profilini gÃ¼ncelle (arka planda) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        _update_profile_async(history + [
            {"role": "user", "content": job.message},
            {"role": "assistant", "content": job.content[:500]},
        ])

        job.finish()
        log.info(
            "ChatJob %s tamamlandÄ±: %d token, %.1fs",
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
    max_tokens: int = 384   # v4.3.0: Daha hÄ±zlÄ± yanÄ±t iÃ§in dÃ¼ÅŸÃ¼rÃ¼ldÃ¼ (eski 512)
    file_context: str = ""
    deep_think: bool = False   # o1/o3 modu â€” yanÄ±t vermeden Ã¶nce dÃ¼ÅŸÃ¼n
    speed_mode: bool = True


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
        speed_mode=req.speed_mode,
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
        return {"error": "Ä°ÅŸ bulunamadÄ±", "done": True}
    return job.to_dict()
