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
    Sohbetten öğren — yeterince uzun ve bilgi dolu yanıtları RAG'a ekle.
    Kısa/genel yanıtları atla (belleği kirletme).
    """
    if len(answer) < 150:  # Çok kısa → kaydetme
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
    r"\b(ara|arat|bul|bak|ziyaret et|search|find|visit|browse|araştır|arastir|gez)\b",
    r"\b(en son|son dakika|bugün|bugun|güncel haber|latest|current|şu an|simdi)\b",
    r"\b20[2-9][0-9]\b",
]

# Explicit web command patterns — bu varsa SELF-REF olsa bile web search yap
_WEB_EXPLICIT_PATTERNS = [
    r"\bziyaret\s+et\b",
    r"\baraştır\b|\barastir\b",
    r"\binternett?en\s+(ara|bul|bak|öğren)\b",
    r"\bweb('?de|den)\s+(ara|bul|bak)\b",
    r"\b(ara\s+ve|bul\s+ve|bak\s+ve|gez\s+ve)\b",  # "ara ve getir/söyle/anlat"
    r"\barama\s+yap\b",
    r"\bonline\s+(ara|bul|bak)\b",
    r"\bgüncel(le|i)?\b",
    r"\bne\s+oldu\b",   # "ne oldu" → güncel bilgi
]

# Genel entity / "X hakkında bilgi" patterns — sıkı: en az 2 kelimeli proper noun
# veya açık kategori (şirket/firma/holding) ile birlikte
_ENTITY_INFO_PATTERNS = [
    # Çift büyük harfli isim + bilgi sorusu (örn: "Tekcan Metal hakkında")
    r"\b[A-ZŞĞÜÇÖİ][a-zşğüçöı]{2,}\s+[A-ZŞĞÜÇÖİ][a-zşğüçöı]{2,}.{0,40}(hakk[ıi]nda|nedir|kimdir|nas[ıi]l)",
    # Açık kategori + isim
    r"\b(şirket|firma|company|fabrika|holding|grup)\s+[A-Za-zŞĞÜÇÖİşğüçöı]{3,}",
]

# Genel "selam" ve sosyal sorular — web search YAPMA
_SOCIAL_PATTERNS = [
    r"^\s*(merhaba|selam|hi|hello|hey|günaydın|iyi (akşam|gece)|nasılsın|naber)",
    r"^\s*(teşekkür|sağol|sagol|tamam|ok|peki)",
]

_SELF_REFERENCE_PATTERNS = [
    # Yalnız Claude'un kendisi hakkında — "sen ziyaret et" gibi komutlar HARİÇ
    r"\b(kendin(den|i)|cevabın|cevabin|seni\s+(yapan|geliştiren|kim))\b",
    r"\b(neler\s+yapabilirsin|özelliklerin|yeteneklerin)\b",
    r"\b(codega\s+(ai|nedir|kim))\b",
]


def _looks_self_referential(message: str) -> bool:
    msg = message.lower()
    return any(re.search(p, msg, re.IGNORECASE) for p in _SELF_REFERENCE_PATTERNS)


def _is_social_chat(message: str) -> bool:
    msg = message.lower()
    return any(re.search(p, msg, re.IGNORECASE) for p in _SOCIAL_PATTERNS)


def _needs_web_search(message: str) -> bool:
    msg = message.lower()

    # 0. Sosyal mesaj (selam, teşekkür) → web search asla
    if _is_social_chat(msg) and len(msg) < 50:
        return False

    # 1. Explicit web komutları her durumda True (self-ref check'i bypass)
    for p in _WEB_EXPLICIT_PATTERNS:
        if re.search(p, msg, re.IGNORECASE):
            return True

    # 2. Entity araması (Çok kelimeli proper noun + bilgi sorusu)
    for p in _ENTITY_INFO_PATTERNS:
        if re.search(p, message):   # case-sensitive: proper noun
            return True

    # 3. Self-referential ise (Claude'un kendisi hakkında) ve explicit web yoksa → False
    if _looks_self_referential(msg):
        return False

    # 4. Genel web triggers
    return any(re.search(p, msg, re.IGNORECASE) for p in _WEB_REQUIRED_PATTERNS)


async def _execute_inline_tools(content: str, job) -> str:
    """
    <tool>tool_name(args)</tool> bloklarını çalıştır, sonucu yerine koy.
    Basit prompt-injection-safe pattern.
    """
    import re
    
    pattern = re.compile(r"<tool>(.*?)</tool>", re.DOTALL)
    
    def _safe_call(match):
        tool_call = match.group(1).strip()
        try:
            # Sadece güvenli, beyaz listede olan tool'lar
            if tool_call.startswith("search("):
                query = tool_call[7:-1].strip().strip('"\'')
                from codegaai.core.web_search import web_search
                results = web_search(query, limit=3)
                return "\n[Arama sonuçları]\n" + "\n".join(
                    f"- {r.get('title', '')}: {r.get('snippet', '')[:150]}"
                    for r in results
                ) + "\n"
            elif tool_call.startswith("calc("):
                expr = tool_call[5:-1].strip()
                # Sadece sayısal ifadeler
                if re.match(r"^[\d\s+\-*/().]+$", expr):
                    return f" {eval(expr)} "  # noqa: S307 - kısıtlı eval
            elif tool_call.startswith("time()"):
                from datetime import datetime
                return f" {datetime.now().strftime('%H:%M, %d %B %Y')} "
            return match.group(0)   # Bilinmeyen tool → olduğu gibi bırak
        except Exception as e:
            return f"[Tool hatası: {e}]"
    
    try:
        return pattern.sub(_safe_call, content)
    except Exception:
        return content


def _update_profile_async(messages: list[dict]) -> None:
    """
    Kullanıcı profilini arka planda güncelle (engellemez, hata vermez).
    Sohbetten ilgi alanları, üslup tercihleri çıkartır.
    """
    try:
        import threading
        
        def _run():
            try:
                from codegaai.core.user_profile import UserProfile
                profile = UserProfile.get()
                profile.update_from_messages(messages)
            except (ImportError, AttributeError):
                # UserProfile modülü yoksa sessizce atla
                pass
            except Exception as e:
                log.debug("Profil güncellemesi atlandı: %s", e)
        
        threading.Thread(target=_run, daemon=True).start()
    except Exception:
        pass   # Hiçbir koşulda chat akışını bozma


def _needs_retry(question: str, answer: str) -> bool:
    """
    Self-eval: yanıt yetersizse True dön.

    Kriterler:
    - Çok kısa (< 15 karakter)
    - Belirsiz/kaçamak ifadeler ('bilmiyorum', 'üzgünüm' tek başına)
    - Hata mesajı içeriyor
    - Sadece soruyu tekrarlıyor
    - YASAK kalıplar (Claude-tarzı yanıt için engelleme)
    """
    if not answer or not answer.strip():
        return True

    ans = answer.strip().lower()

    # Çok kısa cevaplar (genellikle yetersiz)
    if len(ans) < 15:
        return True

    # YASAK kalıplar — Claude-tarzı için engellenir
    # Bu kalıplardan biri varsa MUTLAKA retry
    forbidden_patterns = [
        "doğrudan internet üzerinde gezinem",   # gezinemem / gezinemiyorum
        "internet üzerinde doğrudan gezinem",
        "internete doğrudan erişim",
        "internete erişim",                      # "yok" devamı olsa da olmasa da
        "web'e erişim",
        "web e erişim",
        "internete bağlanam",
        "ben bir yapay zeka asistanıyım",
        "ben bir yapay zekayım",
        "ben bir yapay zeka modeliyim",
        "ben sadece bir yapay zeka",
        "gerçek zamanlı veri sağla",
        "gerçek zamanlı bilgi sağla",
        "bilgilerim 2023",
        "bilgilerim 2024",
        "bilgilerim 2025",
        "knowledge cutoff",
        "training data",
        "öncelikle belirtmeliyim",
        "maalesef, ",
        "maalesef bu konuda",
        "üzgünüm, ancak",
        "üzgünüm, ben bir",
        "üzgünüm, doğrudan",
        "as an ai language model",
        "as an ai assistant",
        "i cannot browse",
        "i don't have access to",
        "i don't have the ability",
        "tarayıcı kullanma yeteneğim yok",
        "gezinme yeteneğim yok",
        "tarayıcı yeteneğim yok",
    ]
    for pattern in forbidden_patterns:
        if pattern in ans:
            return True

    # Kaçamak/yetersiz ifade kalıpları (kısa cevap + zayıf ifade)
    weak_patterns = [
        "bilmiyorum",
        "yardımcı olamam",
        "anlayamadım",
        "hata: name",
        "hata: '",
        "is not defined",
        "name error",
        "traceback",
    ]
    weak_count = sum(1 for p in weak_patterns if p in ans)
    if weak_count >= 1 and len(ans) < 100:
        return True

    # Cevap soruyu aynen tekrarlıyorsa
    q = question.strip().lower()
    if q and len(q) > 10 and ans.startswith(q):
        return True

    return False


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
            async with httpx.AsyncClient(timeout=5.0) as client:    # 8→5 sn
                r = await client.get(url, headers=headers, follow_redirects=True)
                text = re.sub(r"<[^>]+>", " ", r.text[:2000])       # 3000→2000
                text = re.sub(r"\s+", " ", text).strip()
                return f"[{url}]\n{text[:1500]}"                    # 2000→1500
        except Exception as exc:
            log.debug("URL okuma hatası: %s", exc)

    try:
        query = message.strip()
        async with httpx.AsyncClient(timeout=5.0) as client:        # 8→5 sn
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
            return f"[Web Araması: {query}]\n{text[:1200]}"         # 1500→1200

        results = []
        # Sadece ilk 3 sonuç (eskiden 5) — daha az context, daha hızlı LLM
        for i, (title, snippet) in enumerate(zip(titles, snippets)):
            title_clean = re.sub(r"<[^>]+>", "", title).strip()
            snippet_clean = re.sub(r"<[^>]+>", "", snippet).strip()
            results.append(f"{i + 1}. {title_clean}: {snippet_clean[:200]}")
            if i >= 2:    # 0,1,2 = 3 sonuç (eski 5)
                break
        return f"[Web Araması: {query}]\n" + "\n".join(results)
    except Exception as exc:
        log.debug("Web araması hatası: %s", exc)
        return ""


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
        self.deep_think = deep_think   # o1/o3 tarzı CoT
        self.thought = ""              # İç düşünce (kullanıcıya gösterilebilir)
        self.status = "pending"
        self.stage = ""                # Anlık aşama: searching, retrieving, generating
        self.content = ""
        self.error = ""
        self.started_at = time.time()
        self.finished_at: Optional[float] = None
        self._lock = threading.Lock()

    def set_stage(self, stage: str) -> None:
        """Anlık aşama bildirimi (UI'da kullanıcıya göster)."""
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
                "thought": self.thought,    # Derin düşünme içeriği
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

        # Akıllı max_tokens: kısa sorulara kısa cevap (hız için)
        msg_len = len(job.message.strip())
        if job.speed_mode and not job.deep_think:
            job.max_tokens = min(job.max_tokens, 384)
        if msg_len < 30:        # "Merhaba", "Nasılsın"
            job.max_tokens = min(job.max_tokens, 96 if job.speed_mode else 128)
        elif msg_len < 80:       # Tek satır soru
            job.max_tokens = min(job.max_tokens, 192 if job.speed_mode else 256)
        # Uzun soru / açıklama isteği → orijinal max_tokens kullan

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

        decision = decide_response(job.message, history=history)

        try:
            from codegaai.core.model_router import ModelRouter
            from codegaai.core.models_registry import ModelRegistry

            router = ModelRouter.get()
            registry = ModelRegistry.get()
            target_model = None
            if job.speed_mode and not job.deep_think and registry.is_llm_downloaded("qwen3-4b-q4_k_m"):
                target_model = "qwen3-4b-q4_k_m"
            elif job.speed_mode and not job.deep_think and registry.is_llm_downloaded("qwen2.5-3b-instruct-q4_k_m"):
                target_model = "qwen2.5-3b-instruct-q4_k_m"
            else:
                target_model = router.select_model(job.message, history=history)
            if target_model:
                router.switch_model_if_needed(target_model)
            elif not engine.is_ready:
                for model in registry.list_llm_models():
                    if registry.is_llm_downloaded(model["id"]):
                        engine.load(model["id"])
                        break
        except Exception as exc:
            log.debug("Model routing atlandı: %s", exc)

        if not engine.is_ready:
            # ─── Simülasyon Modu (Faz 57) ───
            # LLM yok ama uygulama kullanılabilir kalsın
            try:
                from codegaai.core.simulation_mode import simulate_chat_response
                sim = simulate_chat_response(job.message, history)
                job.append(sim["content"])
                job.finish()
                log.info("Simülasyon modu yanıt verdi (LLM yüklü değil)")
                return
            except Exception as sim_exc:
                log.warning("Simülasyon modu başarısız: %s", sim_exc)
                job.finish(error="Model yüklü değil. Sistem → Otomatik Onar ile düzeltebilirsin.")
                return

        web_context = ""
        plugin_result = ""
        # Plugin eşleşmesi — hava/hesap/takvim vb.
        try:
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
                job.set_stage("🔍 İnternette aranıyor...")
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
                # Daha zengin RAG: son mesaj + önceki 2 mesajı birleştir
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
                    # Skorla sırala, en alakalı 3'ü al
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
            full_context += f"\n\n## Yüklenen Dosya İçeriği\n{job.file_context[:8000]}"
        if web_context:
            full_context += f"\n\n## İnternet Araması Sonuçları\n{web_context}"

        system_prompt = build_system_prompt(
            include_tools=decision.uses_tools,
            include_profile=True,              # ← kullanıcı profili dahil
            rag_context=rag_text,              # ← sadece RAG, diğerleri ayrı
            agent_guidance=decision_guidance(decision),
            intent=decision.intent,            # ← coding/calculation/general
            deep_think=job.deep_think,
        )

        # ── Mesaj listesi oluştur + Context Sıkıştırma ───────────────
        if job.deep_think:
            think_prompt = system_prompt + """

## Derin Düşünme Modu AKTİF
Yanıt vermeden önce <think> bloğu içinde adım adım düşün:
<think>
1. Soruyu analiz et
2. Hangi bilgilere ihtiyacım var?
3. Çözüm yaklaşımım nedir?
4. Olası hatalar?
5. En iyi yanıt nasıl olmalı?
</think>
Düşünce sonrası net ve doğrudan yanıt ver."""
            raw_messages = [{"role": "system", "content": think_prompt}]
        else:
            raw_messages = [{"role": "system", "content": system_prompt}]

        raw_messages.extend(history)
        raw_messages.append({"role": "user", "content": job.message})

        # Context sıkıştırma — token limiti aşılacaksa önceki mesajları özetle
        try:
            from codegaai.core.context_manager import ContextManager
            ctx = ContextManager()
            result_ctx = ctx.prepare_context(raw_messages, system_prompt)
            messages = result_ctx.messages
            if result_ctx.was_compressed:
                log.info("Context sıkıştırıldı: %d→%d mesaj",
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
                result = engine.generate(messages, cfg=cfg, use_tools=True)
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

        # ── Tool Calling — <tool>...</tool> bloklarını çalıştır ───────
        if job.content and "<tool>" in job.content:
            job.content = await _execute_inline_tools(job.content, job)

        # ── Self-Evaluation — Kısa/belirsiz yanıtları yeniden yaz ────
        if (not job.speed_mode) and _needs_retry(job.message, job.content):
            log.info("Self-eval: yanıt yetersiz, yeniden üretiliyor")
            job.set_stage("✏️ Yanıt iyileştiriliyor...")

            # Sert yeniden yazma talimatı — Claude tarzı
            retry_instruction = (
                "Bir önceki yanıt YETERSİZ veya yasak kalıp içeriyor. Şu kuralları uygula:\n"
                "1. 'Ben yapay zeka asistanıyım', 'internet üzerinde gezinemiyorum' "
                "gibi kalıpları KULLANMA.\n"
                "2. Eğer kullanıcının sorusunu cevaplayabilmek için web bilgisine "
                "ihtiyacın varsa, bu mesaj geldikten sonra backend zaten web araması "
                "yapacak — sen sadece sentezle.\n"
                "3. Bilmiyorsan 'Hemen araştırıyorum' de — ASLA pes etme.\n"
                "4. Claude gibi cevapla: doğrudan, net, yardımsever, dolgusuz.\n\n"
                "Şimdi soruyu YENİDEN cevapla:\n\n"
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

        if job.chat_id and job.content:
            try:
                store = ChatStore.open()
                store.add_message(job.chat_id, "assistant", job.content)
            except Exception:
                pass

        # ── Sohbetten öğren ───────────────────────────────────────────
        _learn_from_chat(job.message, job.content, decision.intent)

        # ── Kullanıcı profilini güncelle (arka planda) ─────────────────
        _update_profile_async(history + [
            {"role": "user", "content": job.message},
            {"role": "assistant", "content": job.content[:500]},
        ])

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
    max_tokens: int = 384   # v4.3.0: Daha hızlı yanıt için düşürüldü (eski 512)
    file_context: str = ""
    deep_think: bool = False   # o1/o3 modu — yanıt vermeden önce düşün
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
        return {"error": "İş bulunamadı", "done": True}
    return job.to_dict()
