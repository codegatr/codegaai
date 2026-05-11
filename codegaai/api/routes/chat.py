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
    temperature: float = Field(0.35, ge=0.0, le=2.0)
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
        relevant = [h for h in archive_hits if h.get("distance", 99) < 0.75]
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

    # ── MODEL HAZIRLIK KONTROLÜ ──────────────────────────────────
    # Kural: Zaten yüklü model ASLA değiştirilmez.
    # Model router sadece hiç model yüklü değilse devreye girer.
    if not engine.is_ready:
        try:
            from codegaai.core.models_registry import ModelRegistry
            reg = ModelRegistry.get()
            for m in reg.list_llm_models():
                if reg.is_llm_downloaded(m["id"]):
                    log.info("Otomatik model yükleme (chat): %s", m["id"])
                    engine.load(m["id"])
                    break
        except Exception as e:
            log.warning("Otomatik model yükleme başarısız: %s", e)
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

    # Kullanıcı aktif — otonom öğrenmeyi duraklat
    try:
        from codegaai.core.autonomous_learner import AutonomousLearner
        AutonomousLearner.get().mark_activity()
    except Exception:
        pass

    # ── GÜVENLİK KONTROLÜ ──────────────────────────────────────
    try:
        from codegaai.core.safety import SafetyEngine
        safety = SafetyEngine.get()
        safety_result = safety.check_input(last_user)
        if not safety_result.safe:
            refusal_msg = safety.format_refusal(safety_result)
            response_msg = Message(role="assistant", content=refusal_msg)
            msg_id = None
            if req.chat_id is not None:
                store.add_message(req.chat_id, "user", last_user)
                msg_id = store.add_message(
                    req.chat_id, "assistant", refusal_msg, model="safety"
                )
            return ChatResponse(
                message=response_msg, message_id=msg_id,
                model="safety-filter", finish_reason="safety",
                timing_ms=0, chat_id=req.chat_id,
            )
    except ImportError:
        pass

    rag_text = ""
    rag_hits: list[dict] = []
    if req.use_rag and last_user:
        try:
            rag_text, rag_hits = _build_rag_context(
                last_user, exclude_chat_id=req.chat_id, k=4,
            )
        except Exception as rag_err:
            log.warning("RAG hatası, kendini onarıyor: %s", rag_err)
            from codegaai.core.self_healing import SelfHealing
            SelfHealing.get().report_error("memory", str(rag_err))

    # ── DİNAMİK SİSTEM PROMPTU ──────────────────────────────────
    try:
        from codegaai.core.system_prompt import build_system_prompt
        from codegaai.core.safety import SafetyEngine
        from codegaai.core.agent_brain import decide_response, decision_guidance
        history_dicts_for_decision = [
            {"role": m.role, "content": m.content}
            for m in req.messages[:-1]
        ]
        decision = decide_response(last_user, history=history_dicts_for_decision)
        sys_prompt = build_system_prompt(
            include_tools=decision.uses_tools,
            include_profile=True,
            rag_context=rag_text,
            agent_guidance=decision_guidance(decision),
        ) + SafetyEngine.get().build_safety_prompt()
    except Exception:
        sys_prompt = DEFAULT_SYSTEM_PROMPT
        if rag_text:
            sys_prompt = f"{sys_prompt}\n\n## Bağlam\n{rag_text}"

    # ── CHAIN OF THOUGHT + BAĞLAM YÖNETİMİ ─────────────────────
    history_dicts = [{"role": m.role, "content": m.content}
                     for m in req.messages[:-1]]  # son mesaj hariç

    try:
        from codegaai.core.reasoning import ReasoningEngine
        from codegaai.core.context_manager import ContextManager

        # Uzun bağlamı sıkıştır
        ctx_result = ContextManager.get().prepare_context(
            history_dicts, system_prompt=sys_prompt,
        )
        compressed_history = ctx_result.messages

        # CoT + mesaj listesi oluştur
        final_messages, reasoning = ReasoningEngine.get().build_messages(
            question=last_user,
            history=compressed_history,
            system_prompt=sys_prompt,
        )
    except Exception:
        final_messages = [{"role": "system", "content": sys_prompt}]
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

    # ── ÇIKTI GÜVENLİK KONTROLÜ ─────────────────────────────────
    try:
        from codegaai.core.safety import SafetyEngine
        from codegaai.core.reasoning import ReasoningEngine
        out_safety = SafetyEngine.get().check_output(result["content"])
        if not out_safety.safe:
            result["content"] = SafetyEngine.get().format_refusal(out_safety)
    except Exception:
        pass

    # <thinking> bloğunu ayır (UI'da gizli göster)
    try:
        from codegaai.core.reasoning import ReasoningEngine
        thought, clean_content = ReasoningEngine.get().extract_thought(
            result["content"]
        )
        if clean_content:
            result["content"] = clean_content
    except Exception:
        pass

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
                # Kullanıcı profili çıkarımı. Eski sürümde burada undefined
                # history/req.message kullanıldığı için arka plan öğrenmesi sessizce
                # çöküyordu.
                history_dicts = [{"role": m.role, "content": m.content} for m in req.messages]
                history_dicts.append({"role": "assistant", "content": result.get("content", "")})

                from codegaai.core.user_profile import ProfileManager
                ProfileManager.get().extract_async(history_dicts)

                # Otomatik web öğrenmesi varsayılan olarak kapalı; kontrolsüz RAG
                # kirlenmesini engeller. UI'dan explicit başlatılmalı.
            except Exception as exc:
                log.debug("Arka plan profil çıkarımı atlandı: %s", exc)

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
