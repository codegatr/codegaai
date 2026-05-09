"""
Sohbet uç noktası — gerçek LLM + RAG bellek + kalıcı saklama.

Akış:
  1. chat_id verildiyse: kullanıcı mesajını chat_store'a yaz
  2. RAG: arşivde sorguya yakın geçmiş mesajları bul
  3. Çekirdek bellekten ilgili olguları bul
  4. Sistem mesajı + RAG bağlamı + sohbet geçmişi + yeni mesaj → motor
  5. Asistan yanıtını chat_store'a yaz
  6. Yeni kullanıcı mesajı + asistan yanıtını arşive göm (vektör)

Motor yüklü değilse: 200 OK + "model yüklü değil" notu döner
(stub yanıt). UI bu notu görüp model indirme akışını başlatabilir.
"""

from __future__ import annotations

import time
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from codegaai.core.chat_store import ChatStore
from codegaai.core.engine import (
    DEFAULT_SYSTEM_PROMPT,
    GenerationConfig,
    LLMEngine,
)
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


# ============================================================
# Modeller
# ============================================================

class Message(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str


class ChatRequest(BaseModel):
    chat_id: Optional[int] = None
    messages: list[Message] = Field(..., min_length=1)
    model: Optional[str] = None
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(2048, ge=1, le=32768)
    use_rag: bool = True
    stream: bool = False         # Faz 3.1'de gerçek streaming


class ChatResponse(BaseModel):
    message: Message
    message_id: Optional[int] = None      # asistan mesaj ID'si (Faz 7 feedback için)
    model: str
    finish_reason: str
    timing_ms: int
    chat_id: Optional[int] = None
    tokens_in: int = 0
    tokens_out: int = 0
    rag_hits: list[dict] = []
    note: Optional[str] = None


# ============================================================
# RAG bağlam üretimi
# ============================================================

def _build_rag_context(query: str, exclude_chat_id: int | None = None,
                      k: int = 4) -> tuple[str, list[dict]]:
    """
    Arşiv + çekirdek bellekten ilgili parçaları topla, sistem
    mesajına eklenecek kısa bir bağlam metni döndür.

    Returns: (context_text, hits_for_response)
    """
    try:
        from codegaai.core.memory import MemoryStore
        mem = MemoryStore.open()
    except Exception as exc:
        log.warning("Bellek devre dışı: %s", exc)
        return "", []

    parts: list[str] = []
    all_hits: list[dict] = []

    # Çekirdek olgular
    try:
        core_hits = mem.search_core_facts(query, k=3)
        if core_hits:
            facts = "\n".join(f"- {h['content']}" for h in core_hits)
            parts.append(f"Kullanıcı hakkında bilinenler:\n{facts}")
            all_hits.extend([{"source": "core", **h} for h in core_hits])
    except Exception as exc:
        log.warning("Çekirdek arama hatası: %s", exc)

    # Geçmiş mesajlar (mevcut sohbet hariç)
    try:
        archive_hits = mem.search_archive(
            query, k=k, exclude_chat_id=exclude_chat_id,
        )
        # Mesafe filtresi — gerçekten alakalılar
        relevant = [h for h in archive_hits if h.get("distance", 99) < 1.2]
        if relevant:
            snippets = "\n".join(
                f"- ({h['metadata'].get('role', '?')}) {h['content']}"
                for h in relevant[:3]
            )
            parts.append(f"İlgili geçmiş konuşmalar:\n{snippets}")
            all_hits.extend([{"source": "archive", **h} for h in relevant])
    except Exception as exc:
        log.warning("Arşiv arama hatası: %s", exc)

    return "\n\n".join(parts), all_hits


# ============================================================
# Stub fallback (motor yüklü değilse)
# ============================================================

_STUB_NOT_LOADED = (
    "LLM motoru henüz yüklü değil. Üst menüden **Sistem** sekmesine git, "
    "Qwen 2.5 7B modelini indir (~5 GB), sonra yükle. Tek seferlik bir "
    "işlem; sonraki açılışlarda otomatik yüklenecek.\n\n"
    "İndirme tamamlandıktan sonra bu sohbete devam edebilirsin."
)


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    if not req.messages:
        raise HTTPException(400, "messages boş olamaz")

    store = ChatStore.open()
    engine = LLMEngine.get()

    # chat_id verildiyse doğrula + son kullanıcı mesajını DB'ye yaz
    if req.chat_id is not None:
        chat_obj = store.get_chat(req.chat_id)
        if chat_obj is None:
            raise HTTPException(404, f"Sohbet bulunamadı: id={req.chat_id}")

        last = req.messages[-1]
        if last.role == "user":
            user_msg_id = store.add_message(
                req.chat_id, "user", last.content,
            )
            # Mesajı arşive göm (asenkron yapılsa daha iyi olur ama
            # şimdilik blocking — Faz 3.1'de optimize edilecek)
            try:
                from codegaai.core.memory import MemoryStore
                mem = MemoryStore.open()
                mem.archive_message(
                    req.chat_id, user_msg_id, "user", last.content
                )
            except Exception as exc:
                log.warning("Arşive yazma başarısız: %s", exc)

    # Motor yüklü değilse: stub yanıt
    if not engine.is_ready:
        response_msg = Message(role="assistant", content=_STUB_NOT_LOADED)
        stub_msg_id: Optional[int] = None
        if req.chat_id is not None:
            stub_msg_id = store.add_message(
                req.chat_id, "assistant", response_msg.content,
                model="not-loaded",
            )
        return ChatResponse(
            message=response_msg,
            message_id=stub_msg_id,
            model="not-loaded",
            finish_reason="stop",
            timing_ms=0,
            chat_id=req.chat_id,
            note="LLM motoru yüklü değil. /api/models üzerinden bir model yükleyin.",
        )

    # Bağlam oluştur
    last_user = next(
        (m.content for m in reversed(req.messages) if m.role == "user"),
        "",
    )

    rag_text = ""
    rag_hits: list[dict] = []
    if req.use_rag and last_user:
        rag_text, rag_hits = _build_rag_context(
            last_user, exclude_chat_id=req.chat_id, k=4,
        )

    # Dinamik sistem promptu — profil + araçlar + RAG bağlamı
    final_messages: list[dict[str, str]] = []
    try:
        from codegaai.core.system_prompt import build_system_prompt
        sys_prompt = build_system_prompt(
            include_tools=True,
            include_profile=True,
            rag_context=rag_text,
        )
    except Exception:
        sys_prompt = DEFAULT_SYSTEM_PROMPT
        if rag_text:
            sys_prompt = f"{sys_prompt}\n\n## Bağlam\n{rag_text}"

    final_messages.append({"role": "system", "content": sys_prompt})
    for m in req.messages:
        final_messages.append({"role": m.role, "content": m.content})

    cfg = GenerationConfig(
        temperature=req.temperature,
        max_tokens=req.max_tokens,
    )

    try:
        result = engine.generate(final_messages, cfg=cfg)
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))
    except Exception as exc:
        log.exception("Üretim hatası: %s", exc)
        raise HTTPException(500, f"Üretim hatası: {exc}")

    response_msg = Message(role="assistant", content=result["content"])

    # Asistan yanıtını DB'ye + arşive yaz
    asst_msg_id: Optional[int] = None
    if req.chat_id is not None:
        asst_msg_id = store.add_message(
            req.chat_id, "assistant", result["content"],
            model=result.get("model"),
        )
        try:
            from codegaai.core.memory import MemoryStore
            mem = MemoryStore.open()
            mem.archive_message(
                req.chat_id, asst_msg_id, "assistant", result["content"]
            )
        except Exception as exc:
            log.warning("Asistan arşivleme hatası: %s", exc)

    resp = ChatResponse(
        message=response_msg,
        message_id=asst_msg_id,
        model=result["model"],
        finish_reason=result["finish_reason"],
        timing_ms=result["timing_ms"],
        chat_id=req.chat_id,
        tokens_in=result.get("tokens_in", 0),
        tokens_out=result.get("tokens_out", 0),
        rag_hits=rag_hits,
    )

    # Faz 10: Her başarılı yanıt sonrası arka planda web öğrenmesi
    # (state=idle ise — aktif öğrenme varsa atla)
    if req.chat_id:
        def _bg_learn():
            try:
                # Kullanıcı profili çıkarımı
                from codegaai.core.user_profile import ProfileManager
                history_dicts = [{"role": m.role, "content": m.content} for m in history]
                history_dicts.append({"role": "user", "content": req.message})
                history_dicts.append({"role": "assistant", "content": response_msg})
                ProfileManager.get().extract_async(history_dicts)

                # Web öğrenmesi
                from codegaai.core.web_learner import WebLearner
                lrn = WebLearner.get()
                if lrn.status["state"] == "idle":
                    topics = lrn.extract_topics_from_chat(history_dicts)
                    if topics:
                        log.debug("Sohbet öğrenmesi: %s", topics)
                        lrn.learn_async(topics=topics)
            except Exception:
                pass

        import threading as _th
        _th.Thread(target=_bg_learn, daemon=True,
                   name="bg-learn").start()

    return resp


@router.get("/models")
async def list_models() -> dict:
    """Geriye uyum için — gerçek katalog /api/models'de."""
    from codegaai.core.models_registry import ModelRegistry
    registry = ModelRegistry.get()
    engine = LLMEngine.get()
    loaded = []
    if engine.is_ready and engine.status.get("model_id"):
        loaded.append({"id": engine.status["model_id"]})
    return {
        "loaded": loaded,
        "available_for_download": registry.list_llm_models(),
    }


@router.get("/status")
async def status() -> dict:
    engine = LLMEngine.get()
    return {
        **engine.status,
        "phase": "Faz 3",
        "now": datetime.now().isoformat(),
    }
