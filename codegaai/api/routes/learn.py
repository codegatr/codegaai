"""
Web öğrenme uç noktaları (Faz 10).

GET  /api/learn/status              — durum + son görevler
POST /api/learn/search              — anlık web araması
POST /api/learn/topics              — konular → öğren → RAG
POST /api/learn/feeds               — tüm feed'leri besle
POST /api/learn/chat/{chat_id}      — sohbetten konu çıkar → öğren
POST /api/learn/cancel              — aktif öğrenmeyi iptal et
GET  /api/learn/log                 — öğrenme geçmişi

GET  /api/learn/feeds               — feed listesi
POST /api/learn/feeds/add           — feed ekle
PATCH /api/learn/feeds/{i}/toggle   — aktif/pasif
DELETE /api/learn/feeds/{i}         — sil

GET  /api/learn/scheduler           — zamanlayıcı durumu
POST /api/learn/scheduler/{id}/run  — görevi hemen çalıştır
POST /api/learn/scheduler/{id}/toggle — aktif/pasif
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from codegaai.core.web_learner import WebLearner
from codegaai.core.scheduler import Scheduler
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    max_results: int = Field(5, ge=1, le=20)
    crawl: bool = True
    store: bool = True


class TopicsRequest(BaseModel):
    topics: list[str] = Field(..., min_items=1, max_items=10)
    crawl: bool = True
    store: bool = True


class AddFeedRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    url: str = Field(..., min_length=5, max_length=1000)
    type: str = "rss"
    category: str = "genel"


class ToggleRequest(BaseModel):
    enabled: bool


@router.get("/status")
async def status() -> dict:
    return {**WebLearner.get().status, "phase": "Faz 10"}


@router.post("/search")
async def search(req: SearchRequest) -> dict:
    """Anlık web araması — sonuçları RAG'a kaydet (opsiyonel)."""
    lrn = WebLearner.get()
    results = lrn.search(req.query, max_results=req.max_results)

    if req.crawl:
        for r in results:
            if r.url:
                r.content = lrn.crawl(r.url)

    stored = 0
    if req.store:
        stored = lrn.store_to_memory(results)

    return {
        "query": req.query,
        "results": [r.to_dict() for r in results],
        "stored": stored,
    }


@router.post("/topics")
async def learn_topics(req: TopicsRequest) -> dict:
    """Verilen konuları asenkron öğren."""
    lrn = WebLearner.get()
    if lrn.status["state"] != "idle":
        raise HTTPException(409, "Şu an başka bir öğrenme işlemi aktif")

    thread = lrn.learn_async(topics=req.topics)
    return {
        "started": True,
        "topics": req.topics,
        "status": lrn.status,
    }


@router.post("/feeds")
async def learn_feeds() -> dict:
    """Tüm aktif feed'leri asenkron besle."""
    lrn = WebLearner.get()
    lrn.learn_async(feeds=True)
    return {"started": True, "status": lrn.status}


@router.post("/chat/{chat_id}")
async def learn_from_chat(chat_id: str) -> dict:
    """Belirtilen sohbetten konu çıkar ve web'den öğren."""
    from codegaai.core.chat_store import ChatStore

    store = ChatStore.get()
    messages = store.get_messages(chat_id)
    if not messages:
        raise HTTPException(404, "Sohbet bulunamadı veya boş")

    lrn = WebLearner.get()
    topics = lrn.extract_topics_from_chat(
        [m.__dict__ for m in messages]
    )

    if not topics:
        return {"topics": [], "started": False,
                "message": "Konu tespit edilemedi"}

    lrn.learn_async(topics=topics)
    return {
        "topics": topics,
        "started": True,
        "status": lrn.status,
    }


@router.post("/cancel")
async def cancel() -> dict:
    return {"cancelled": WebLearner.get().cancel()}


@router.get("/log")
async def get_log(limit: int = 50) -> dict:
    return {"log": WebLearner.get().get_log(limit=limit)}


# ---- Feed yönetimi ----

@router.get("/feeds")
async def list_feeds() -> dict:
    return {"feeds": WebLearner.get().list_feeds()}


@router.post("/feeds/add")
async def add_feed(req: AddFeedRequest) -> dict:
    entry = WebLearner.get().add_feed(
        req.name, req.url, req.type, req.category
    )
    return {"feed": entry, "feeds": WebLearner.get().list_feeds()}


@router.patch("/feeds/{index}/toggle")
async def toggle_feed(index: int, req: ToggleRequest) -> dict:
    ok = WebLearner.get().toggle_feed(index, req.enabled)
    if not ok:
        raise HTTPException(404, "Feed bulunamadı")
    return {"feeds": WebLearner.get().list_feeds()}


@router.delete("/feeds/{index}")
async def delete_feed(index: int) -> dict:
    ok = WebLearner.get().delete_feed(index)
    if not ok:
        raise HTTPException(404, "Feed bulunamadı")
    return {"feeds": WebLearner.get().list_feeds()}


# ---- Zamanlayıcı ----

@router.get("/scheduler")
async def scheduler_status() -> dict:
    return {"jobs": Scheduler.get().jobs}


@router.post("/scheduler/{job_id}/run")
async def run_job(job_id: str) -> dict:
    ok = Scheduler.get().run_now(job_id)
    if not ok:
        raise HTTPException(404, "Görev bulunamadı")
    return {"started": True, "job_id": job_id}


@router.post("/scheduler/{job_id}/toggle")
async def toggle_job(job_id: str, req: ToggleRequest) -> dict:
    ok = Scheduler.get().toggle(job_id, req.enabled)
    if not ok:
        raise HTTPException(404, "Görev bulunamadı")
    return {"jobs": Scheduler.get().jobs}
