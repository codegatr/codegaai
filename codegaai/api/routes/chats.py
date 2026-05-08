"""Sohbet yönetimi uç noktaları (Faz 2.1)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from codegaai.core.chat_store import ChatStore

router = APIRouter()


# ============================================================
# Modeller
# ============================================================

class CreateChatRequest(BaseModel):
    title: str = Field("Yeni sohbet", max_length=200)


class RenameChatRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


class AppendMessageRequest(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str = Field(..., min_length=1)
    model: str | None = None


# ============================================================
# Sohbetler
# ============================================================

@router.get("")
async def list_chats() -> dict:
    """Tüm sohbetleri en yeniden eskiye sırala."""
    store = ChatStore.open()
    return {"chats": store.list_chats()}


@router.post("")
async def create_chat(req: CreateChatRequest) -> dict:
    """Yeni sohbet oluştur."""
    store = ChatStore.open()
    chat_id = store.create_chat(req.title)
    chat = store.get_chat(chat_id)
    return {"chat": chat}


@router.get("/{chat_id}")
async def get_chat(chat_id: int) -> dict:
    """Sohbet bilgisi + tüm mesajları."""
    store = ChatStore.open()
    chat = store.get_chat(chat_id)
    if chat is None:
        raise HTTPException(404, "Sohbet bulunamadı")
    messages = store.get_messages(chat_id)
    return {"chat": chat, "messages": messages}


@router.patch("/{chat_id}")
async def rename_chat(chat_id: int, req: RenameChatRequest) -> dict:
    """Sohbet başlığını değiştir."""
    store = ChatStore.open()
    if not store.rename_chat(chat_id, req.title):
        raise HTTPException(404, "Sohbet bulunamadı")
    return {"chat": store.get_chat(chat_id)}


@router.delete("/{chat_id}")
async def delete_chat(chat_id: int) -> dict:
    """Sohbeti ve tüm mesajlarını sil."""
    store = ChatStore.open()
    if not store.delete_chat(chat_id):
        raise HTTPException(404, "Sohbet bulunamadı")
    return {"deleted": True, "id": chat_id}


@router.post("/{chat_id}/messages")
async def add_message(chat_id: int, req: AppendMessageRequest) -> dict:
    """Sohbete mesaj ekle."""
    store = ChatStore.open()
    chat = store.get_chat(chat_id)
    if chat is None:
        raise HTTPException(404, "Sohbet bulunamadı")
    msg_id = store.add_message(chat_id, req.role, req.content, req.model)
    return {"message_id": msg_id}


@router.get("/{chat_id}/messages")
async def get_messages(chat_id: int) -> dict:
    """Sohbetin tüm mesajları."""
    store = ChatStore.open()
    chat = store.get_chat(chat_id)
    if chat is None:
        raise HTTPException(404, "Sohbet bulunamadı")
    return {"messages": store.get_messages(chat_id)}
