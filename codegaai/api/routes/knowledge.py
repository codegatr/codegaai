"""
codegaai.api.routes.knowledge
==============================

Faz 51: Bilgi Tabanı (RAG) — kullanıcı not/belge ekler, arama yapar.

Endpoint'ler:
- POST /api/knowledge/add        — Not/belge ekle
- GET  /api/knowledge/search     — Arama yap
- GET  /api/knowledge/list       — Tüm kayıtları listele
- DELETE /api/knowledge/{id}     — Kayıt sil
"""

from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel
from typing import Optional
import json
import time
import uuid

from codegaai.config import DATA_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()

KB_DIR = DATA_DIR / "knowledge_base"
KB_INDEX = KB_DIR / "index.json"


class KBEntry(BaseModel):
    title: str
    content: str
    tags: list[str] = []
    source: str = "manual"  # manual, upload, web


class KBRecord(BaseModel):
    id: str
    title: str
    content: str
    tags: list[str]
    source: str
    created_at: float
    embedding: Optional[list[float]] = None


def _load_index() -> list[dict]:
    """KB index'i yükle."""
    try:
        if KB_INDEX.exists():
            return json.loads(KB_INDEX.read_text("utf-8"))
    except Exception:
        pass
    return []


def _save_index(records: list[dict]) -> None:
    """KB index'i kaydet."""
    KB_DIR.mkdir(parents=True, exist_ok=True)
    KB_INDEX.write_text(json.dumps(records, ensure_ascii=False, indent=2), "utf-8")


@router.post("/add")
async def add_entry(entry: KBEntry) -> dict:
    """Bilgi tabanına yeni kayıt ekle."""
    try:
        from codegaai.core.embeddings import EmbeddingService
        emb_svc = EmbeddingService.get()

        # Embedding oluştur
        embedding = None
        if emb_svc.is_ready:
            vecs = emb_svc.embed([entry.content])
            embedding = vecs[0] if vecs else None

        # Kayıt oluştur
        record = {
            "id": str(uuid.uuid4())[:8],
            "title": entry.title,
            "content": entry.content,
            "tags": entry.tags,
            "source": entry.source,
            "created_at": time.time(),
            "embedding": embedding,
        }

        # Index'e ekle
        index = _load_index()
        index.append(record)
        _save_index(index)

        log.info("KB eklendi: %s (id=%s)", entry.title, record["id"])
        return {"success": True, "id": record["id"]}

    except Exception as e:
        log.error("KB ekleme hatası: %s", e)
        return {"success": False, "error": str(e)}


@router.get("/search")
async def search(q: str, limit: int = 5) -> dict:
    """Bilgi tabanında arama yap (semantic + keyword)."""
    try:
        from codegaai.core.embeddings import EmbeddingService
        emb_svc = EmbeddingService.get()

        index = _load_index()
        if not index:
            return {"results": []}

        # Semantic search (embedding varsa)
        results = []
        if emb_svc.is_ready:
            q_vec = emb_svc.embed([q])[0]

            def cosine_sim(a, b):
                if not a or not b or len(a) != len(b):
                    return 0
                dot = sum(x * y for x, y in zip(a, b))
                norm_a = sum(x * x for x in a) ** 0.5
                norm_b = sum(y * y for y in b) ** 0.5
                return dot / (norm_a * norm_b) if norm_a and norm_b else 0

            scored = [
                (rec, cosine_sim(q_vec, rec.get("embedding")))
                for rec in index if rec.get("embedding")
            ]
            scored.sort(key=lambda x: x[1], reverse=True)
            results = [
                {
                    "id": r[0]["id"],
                    "title": r[0]["title"],
                    "content": r[0]["content"][:200] + "...",
                    "tags": r[0]["tags"],
                    "score": round(r[1], 3),
                }
                for r in scored[:limit]
            ]
        else:
            # Fallback: keyword search
            q_lower = q.lower()
            for rec in index:
                if q_lower in rec["title"].lower() or q_lower in rec["content"].lower():
                    results.append({
                        "id": rec["id"],
                        "title": rec["title"],
                        "content": rec["content"][:200] + "...",
                        "tags": rec["tags"],
                        "score": 0.5,
                    })
            results = results[:limit]

        return {"results": results}

    except Exception as e:
        log.error("KB arama hatası: %s", e)
        return {"results": [], "error": str(e)}


@router.get("/list")
async def list_entries(offset: int = 0, limit: int = 20) -> dict:
    """Tüm KB kayıtlarını listele."""
    index = _load_index()
    total = len(index)
    items = [
        {
            "id": r["id"],
            "title": r["title"],
            "content": r["content"][:150] + "..." if len(r["content"]) > 150 else r["content"],
            "tags": r["tags"],
            "source": r["source"],
            "created_at": r["created_at"],
        }
        for r in index[offset:offset + limit]
    ]
    return {"items": items, "total": total}


@router.delete("/{entry_id}")
async def delete_entry(entry_id: str) -> dict:
    """KB kaydını sil."""
    index = _load_index()
    before = len(index)
    index = [r for r in index if r["id"] != entry_id]
    after = len(index)

    if before == after:
        return {"success": False, "error": "Kayıt bulunamadı"}

    _save_index(index)
    log.info("KB silindi: %s", entry_id)
    return {"success": True}
