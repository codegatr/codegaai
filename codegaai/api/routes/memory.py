"""Bellek (RAG) uç noktaları (Faz 3 stub)."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(5, ge=1, le=50)
    filter: dict | None = None


class LearnRequest(BaseModel):
    content: str = Field(..., min_length=1)
    tags: list[str] = []
    metadata: dict | None = None


@router.post("/search")
async def search(req: SearchRequest) -> dict:
    return {
        "status": "stub",
        "message": "RAG bellek araması Faz 3'te (v0.3.0) aktif olacak.",
        "results": [],
    }


@router.post("/learn")
async def learn(req: LearnRequest) -> dict:
    return {
        "status": "stub",
        "message": "Bellek öğrenme Faz 3'te (v0.3.0) aktif olacak.",
        "stored": False,
    }


@router.get("/stats")
async def stats() -> dict:
    return {
        "working_memory_messages": 0,
        "archive_documents": 0,
        "core_facts": 0,
        "embeddings_total": 0,
        "vector_store": "chromadb",
        "embedding_model": "bge-m3",
        "active": False,
        "expected_in": "Faz 3 (v0.3.0)",
    }


@router.get("/status")
async def status() -> dict:
    return {"active": False, "phase": "Faz 2", "expected_in": "Faz 3 (v0.3.0)"}
