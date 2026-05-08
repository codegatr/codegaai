"""
Sohbet uç noktası — Faz 3'te gerçek LLM motoru gelene kadar stub.

v0.2.1'de eklendi: chat_id ile mesajlar SQLite'a yazılır.
Sohbet kalıcılığı şimdiden çalışıyor; Faz 3'te yalnızca yanıt
üretici stub'tan gerçek LLM'e geçecek.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from codegaai.core.chat_store import ChatStore

router = APIRouter()


class Message(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str


class ChatRequest(BaseModel):
    chat_id: Optional[int] = Field(
        None,
        description="Mesajları kalıcı saklamak için sohbet ID. None ise stateless.",
    )
    messages: list[Message] = Field(..., min_length=1)
    model: Optional[str] = None
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(2048, ge=1, le=32768)
    stream: bool = False


class ChatResponse(BaseModel):
    message: Message
    model: str
    finish_reason: str
    timing_ms: int
    chat_id: Optional[int] = None
    note: Optional[str] = None


# Faz 3'te bu sabit yanıt yerine gerçek LLM çıktısı gelecek.
_STUB_RESPONSE = (
    "Merhaba! Ben CODEGA AI'ın sohbet motoruyum.\n\n"
    "Şu an **Faz 2.1** sürümündeyiz: arayüz çalışıyor, sohbetler "
    "kalıcı olarak veritabanına kaydediliyor, ama LLM motorum henüz "
    "yüklenmedi.\n\n"
    "**Faz 3'te** Qwen 2.5 7B yüklenecek, BGE-M3 embedding ve "
    "ChromaDB tabanlı RAG belleği aktive olacak. UI hiç değişmeyecek "
    "— sadece bu yanıtın yerini gerçek anlama, akıl yürütme ve "
    "Türkçe sohbet alacak.\n\n"
    "Şimdilik yeni sohbet aç, eski sohbetlere geri dön, başlık "
    "değiştir, sil — hepsi çalışıyor. Backend ve veritabanı şeması "
    "Faz 3 için hazır."
)


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    """Stub yanıt üret + mesajları kalıcı sakla (chat_id verilmişse)."""
    if not req.messages:
        raise HTTPException(400, "messages boş olamaz")

    store = ChatStore.open()

    # chat_id verilmişse: son kullanıcı mesajını DB'ye yaz
    if req.chat_id is not None:
        chat = store.get_chat(req.chat_id)
        if chat is None:
            raise HTTPException(404, f"Sohbet bulunamadı: id={req.chat_id}")

        last = req.messages[-1]
        if last.role == "user":
            store.add_message(req.chat_id, "user", last.content)

    response_msg = Message(role="assistant", content=_STUB_RESPONSE)

    # Asistan yanıtını da kalıcı sakla
    if req.chat_id is not None:
        store.add_message(
            req.chat_id, "assistant", response_msg.content, model="stub-faz2"
        )

    return ChatResponse(
        message=response_msg,
        model="stub-faz2",
        finish_reason="stop",
        timing_ms=0,
        chat_id=req.chat_id,
        note="Bu yanıt stub — gerçek LLM Faz 3'te (v0.3.0) gelecek.",
    )


@router.get("/models")
async def list_models() -> dict:
    return {
        "loaded": [],
        "available_for_download": [
            {
                "id": "qwen2.5-7b-instruct-q4_k_m",
                "name": "Qwen 2.5 7B Instruct (Q4_K_M)",
                "size_gb": 4.7,
                "vram_gb": 5.5,
                "languages": ["tr", "en", "zh", "ar", "fr", "de", "es"],
                "default": True,
            },
            {
                "id": "qwen2.5-coder-7b-instruct-q4_k_m",
                "name": "Qwen 2.5 Coder 7B (Q4_K_M)",
                "size_gb": 4.7,
                "vram_gb": 5.5,
                "specialty": "code",
            },
            {
                "id": "llama-3.1-8b-instruct-q4_k_m",
                "name": "Llama 3.1 8B Instruct (Q4_K_M)",
                "size_gb": 4.9,
                "vram_gb": 6.0,
            },
            {
                "id": "aya-expanse-8b-q4_k_m",
                "name": "Aya Expanse 8B (Q4_K_M)",
                "size_gb": 5.1,
                "vram_gb": 6.2,
                "languages": ["tr", "en", "ar", "fa", "ru", "zh", "ja"],
                "note": "Çok dilli, Türkçe için güçlü",
            },
        ],
    }


@router.get("/status")
async def status() -> dict:
    return {
        "active": False,
        "phase": "Faz 2.1",
        "expected_in": "Faz 3 (v0.3.0)",
        "now": datetime.now().isoformat(),
    }
