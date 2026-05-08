"""Bellek (RAG) uç noktaları — gerçek ChromaDB tabanlı."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from codegaai.core.chat_store import ChatStore
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(5, ge=1, le=50)
    layer: str = Field("archive", pattern="^(archive|core|both)$")


class LearnRequest(BaseModel):
    content: str = Field(..., min_length=1)
    tags: list[str] = []


def _get_memory():
    """Lazy import wrapper - ChromaDB yüklü değilse net hata ver."""
    try:
        from codegaai.core.memory import MemoryStore
        return MemoryStore.open()
    except ImportError as exc:
        raise HTTPException(
            503,
            f"Bellek altyapısı yüklü değil. ChromaDB kurun: {exc}"
        )


@router.post("/search")
async def search(req: SearchRequest) -> dict:
    """Bellekte semantik arama."""
    mem = _get_memory()
    results: dict = {"query": req.query, "results": {}}

    try:
        if req.layer in ("archive", "both"):
            results["results"]["archive"] = mem.search_archive(
                req.query, k=req.top_k,
            )
        if req.layer in ("core", "both"):
            results["results"]["core"] = mem.search_core_facts(
                req.query, k=req.top_k,
            )
        return results
    except Exception as exc:
        log.exception("Arama hatası: %s", exc)
        raise HTTPException(500, f"Arama hatası: {exc}")


@router.post("/learn")
async def learn(req: LearnRequest) -> dict:
    """Çekirdek belleğe yeni gerçek ekle."""
    mem = _get_memory()
    try:
        fact_id = mem.add_core_fact(req.content, tags=req.tags)
        return {"stored": True, "id": fact_id}
    except Exception as exc:
        log.exception("Öğrenme hatası: %s", exc)
        raise HTTPException(500, f"Öğrenme hatası: {exc}")


@router.get("/core")
async def list_core() -> dict:
    """Tüm çekirdek olgular."""
    mem = _get_memory()
    return {"facts": mem.list_core_facts()}


@router.delete("/core/{fact_id}")
async def delete_core_fact(fact_id: str) -> dict:
    mem = _get_memory()
    ok = mem.delete_core_fact(fact_id)
    if not ok:
        raise HTTPException(404, "Olgu bulunamadı")
    return {"deleted": True}


@router.get("/stats")
async def stats() -> dict:
    """Bellek istatistikleri."""
    store = ChatStore.open()

    # ChromaDB yüklenemezse 0 dön (hata yerine)
    try:
        from codegaai.core.memory import MemoryStore
        mem = MemoryStore.open()
        mem_stats = mem.stats()
    except Exception as exc:
        log.warning("Bellek istatistiği alınamadı: %s", exc)
        mem_stats = {"archive_documents": 0, "core_facts": 0}

    return {
        "working_memory_messages": store.message_count(),
        "archive_documents": mem_stats.get("archive_documents", 0),
        "core_facts": mem_stats.get("core_facts", 0),
        "total_chats": len(store.list_chats()),
        "vector_store": "chromadb",
        "embedding_model": "bge-m3",
    }


@router.get("/status")
async def status() -> dict:
    """Bellek altyapısının durumu."""
    from codegaai.core.embeddings import EmbeddingService
    svc = EmbeddingService.get()

    chromadb_available = False
    try:
        import chromadb  # type: ignore[import-not-found]
        chromadb_available = True
    except ImportError:
        pass

    return {
        "embedding": svc.status,
        "chromadb_installed": chromadb_available,
        "phase": "Faz 3",
        "active": chromadb_available and svc.is_ready,
    }
