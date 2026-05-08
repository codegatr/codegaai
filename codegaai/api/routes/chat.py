"""Sohbet uç noktaları (Faz 2 stub, Faz 3'te gerçek motor)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ============================================================
# Pydantic modelleri
# ============================================================

class Message(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str


class ChatRequest(BaseModel):
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
    note: Optional[str] = None


# ============================================================
# Stub yanıtı
# ============================================================

_STUB_RESPONSE = (
    "Merhaba! Ben CODEGA AI'ın sohbet motoruyum.\n\n"
    "Şu an **Faz 2 (Masaüstü UI)** sürümündeyiz, yani sen bu arayüzü görüyorsun "
    "ama LLM motorum henüz yüklü değil.\n\n"
    "**Faz 3'te** Qwen 2.5 7B modeli, BGE-M3 embedding ve ChromaDB tabanlı RAG "
    "belleği aktive olacak. O zaman gerçekten konuşabileceğiz, kod yazabilirim, "
    "ve her etkileşimden öğrenmeye başlayacağım.\n\n"
    "Şimdilik UI'ın her parçasını test edebilirsin — ayarlar, sistem kontrolü, "
    "menüler. Backend hazır, yapay zeka motorları sırada."
)


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    """Faz 2 stub — sabit bilgilendirici yanıt döndürür."""
    if not req.messages:
        raise HTTPException(400, "messages boş olamaz")

    return ChatResponse(
        message=Message(role="assistant", content=_STUB_RESPONSE),
        model="stub-faz2",
        finish_reason="stop",
        timing_ms=0,
        note="Bu yanıt stub — gerçek LLM Faz 3'te gelecek (v0.3.0).",
    )


@router.get("/models")
async def list_models() -> dict:
    """Mevcut LLM modellerini listele (Faz 2'de hiçbiri yüklü değil)."""
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
        "phase": "Faz 2",
        "expected_in": "Faz 3 (v0.3.0)",
        "now": datetime.now().isoformat(),
    }
