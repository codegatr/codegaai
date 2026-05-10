"""
codegaai.core.memory
=====================

3 katmanlı bellek mimarisi (Letta + Mem0 paradigması):

1. **Working memory**: Mevcut sohbetin son N mesajı.
   Doğrudan SQLite'tan okunur (codegaai.core.chat_store).

2. **Archive memory**: Tüm geçmiş mesajlar BGE-M3 ile vektörlenir,
   ChromaDB'de saklanır. RAG: kullanıcı sorgusuna en yakın K parça
   geri çağrılır.

3. **Core memory**: Kullanıcı hakkında damıtılmış kalıcı gerçekler
   ("Yunus PHP geliştiricisi", "Konya'da yaşıyor"). LLM tarafından
   üretilir, çelişkilerde güncellenir.

Tüm vektör operasyonları lazy. ChromaDB ve embedding servisi sadece
ilk çağrıda yüklenir.

Kullanım:

    mem = MemoryStore.open()
    mem.archive_message(chat_id=1, message_id=5,
                        role="user", content="PHP nasıl yüklenir?")
    hits = mem.search_archive("PHP kurulumu", k=3)
    mem.add_core_fact("Kullanıcı PHP geliştiricisi.")
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any, Optional

from codegaai.config import MEMORY_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)


# ============================================================
# Sabitler
# ============================================================

ARCHIVE_COLLECTION = "archive_messages"
CORE_COLLECTION = "core_facts"


# ============================================================
# MemoryStore
# ============================================================

class MemoryStore:
    """3 katmanlı bellek. Singleton."""

    _instance: Optional["MemoryStore"] = None
    _instance_lock = threading.Lock()

    def __init__(self) -> None:
        self._client = None  # ChromaDB PersistentClient
        self._archive = None
        self._core = None
        self._init_lock = threading.Lock()
        self._initialized = False

    @classmethod
    def open(cls) -> "MemoryStore":
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # get() = open() takma adı (autonomous_learner uyumu)
    @classmethod
    def get(cls) -> "MemoryStore":
        return cls.open()

    # ---- lazy init ----

    def _ensure_initialized(self) -> None:
        if self._initialized:
            return

        with self._init_lock:
            if self._initialized:
                return

            log.info("Bellek başlatılıyor (ChromaDB)...")

            # Lazy import — chromadb ağır
            import chromadb  # type: ignore[import-not-found]

            db_path = MEMORY_DIR / "chroma"
            db_path.mkdir(parents=True, exist_ok=True)

            self._client = chromadb.PersistentClient(path=str(db_path))

            # Embedding fonksiyonu — kendi servisimizi kullan
            ef = _CodegaEmbeddingFunction()

            self._archive = self._client.get_or_create_collection(
                name=ARCHIVE_COLLECTION,
                embedding_function=ef,
                metadata={"description": "Tüm sohbet mesajları"},
            )
            self._core = self._client.get_or_create_collection(
                name=CORE_COLLECTION,
                embedding_function=ef,
                metadata={"description": "Kullanıcı hakkında çekirdek olgular"},
            )
            self._initialized = True
            log.info("ChromaDB hazır: %s", db_path)

    # ---- arşiv (katman 2) ----

    def archive_message(self, chat_id: int, message_id: int,
                        role: str, content: str) -> None:
        """Bir mesajı arşive ekle (vektörle birlikte)."""
        self._ensure_initialized()

        doc_id = f"chat_{chat_id}_msg_{message_id}"
        try:
            self._archive.add(
                ids=[doc_id],
                documents=[content],
                metadatas=[{
                    "chat_id": chat_id,
                    "message_id": message_id,
                    "role": role,
                    "ts": time.time(),
                }],
            )
        except Exception as exc:
            # Duplicate ID hatası vb. — sessizce geç
            log.debug("Arşive ekleme hatası (yok sayıldı): %s", exc)

    def search_archive(self, query: str, k: int = 5,
                       exclude_chat_id: int | None = None) -> list[dict[str, Any]]:
        """Sorguya en yakın K mesajı getir."""
        self._ensure_initialized()

        where: dict[str, Any] | None = None
        if exclude_chat_id is not None:
            where = {"chat_id": {"$ne": exclude_chat_id}}

        try:
            from codegaai.core.embeddings import EmbeddingService
            qvec = EmbeddingService.get().embed([query])
            results = self._archive.query(
                query_embeddings=qvec,
                n_results=k,
                where=where,
            )
        except Exception as exc:
            log.error("Arşiv araması hatası: %s", exc)
            return []

        hits: list[dict[str, Any]] = []
        ids = results.get("ids", [[]])[0]
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        dists = results.get("distances", [[]])[0]

        for i, doc_id in enumerate(ids):
            hits.append({
                "id": doc_id,
                "content": docs[i] if i < len(docs) else "",
                "metadata": metas[i] if i < len(metas) else {},
                "distance": float(dists[i]) if i < len(dists) else 0.0,
            })
        return hits

    def archive_count(self) -> int:
        try:
            self._ensure_initialized()
            return int(self._archive.count())
        except Exception:
            return 0

    # ---- çekirdek (katman 3) ----

    def add(self, text: str, metadata: dict | None = None,
            collection: str = "core") -> str:
        """
        Evrensel bellek ekleme metodu.
        collection: 'core' veya 'archive'
        """
        self._ensure_initialized()
        fact_id = f"mem_{int(time.time() * 1000)}_{hash(text[:50]) % 10000}"
        meta = {
            "ts": time.time(),
            "source": (metadata or {}).get("source", "unknown"),
            **(metadata or {}),
        }
        # Metadata değerleri string/int/float/bool olmalı
        clean_meta: dict[str, Any] = {}
        for k, v in meta.items():
            if isinstance(v, (str, int, float, bool)):
                clean_meta[k] = v
            else:
                clean_meta[k] = str(v)

        try:
            col = self._archive if collection == "archive" else self._core
            col.add(ids=[fact_id], documents=[text], metadatas=[clean_meta])
        except Exception as exc:
            log.warning("Bellek kayıt hatası (%s): %s", collection, exc)
            # Fallback: core'a ekle
            try:
                self._core.add(ids=[fact_id], documents=[text], metadatas=[clean_meta])
            except Exception:
                pass
        return fact_id

    def search(self, query: str, n_results: int = 5,
               collections: list[str] | None = None) -> list[dict]:
        """Evrensel arama — core ve archive koleksiyonlarında."""
        self._ensure_initialized()
        cols = collections or ["core", "archive"]
        hits = []
        if "core" in cols:
            for h in self.search_core_facts(query, k=n_results):
                hits.append({"text": h.get("content", ""), **h})
        if "archive" in cols:
            for h in self.search_archive(query, k=n_results):
                hits.append({"text": h.get("content", ""), **h})
        return hits[:n_results]

    def add_core_fact(self, content: str,
                      tags: list[str] | None = None) -> str:
        """Çekirdek belleğe gerçek ekle."""
        self._ensure_initialized()
        fact_id = f"fact_{int(time.time() * 1000)}"
        self._core.add(
            ids=[fact_id],
            documents=[content],
            metadatas=[{
                "ts": time.time(),
                "tags": ",".join(tags or []),
            }],
        )
        return fact_id

    def search_core_facts(self, query: str, k: int = 5) -> list[dict[str, Any]]:
        self._ensure_initialized()
        try:
            from codegaai.core.embeddings import EmbeddingService
            qvec = EmbeddingService.get().embed([query])
            results = self._core.query(query_embeddings=qvec, n_results=k)
        except Exception as exc:
            log.error("Çekirdek araması hatası: %s", exc)
            return []

        hits = []
        ids = results.get("ids", [[]])[0]
        docs = results.get("documents", [[]])[0]
        dists = results.get("distances", [[]])[0]
        for i, doc_id in enumerate(ids):
            hits.append({
                "id": doc_id,
                "content": docs[i] if i < len(docs) else "",
                "distance": float(dists[i]) if i < len(dists) else 0.0,
            })
        return hits

    def list_core_facts(self) -> list[dict[str, Any]]:
        self._ensure_initialized()
        try:
            results = self._core.get()
        except Exception:
            return []
        ids = results.get("ids", [])
        docs = results.get("documents", [])
        metas = results.get("metadatas", [])
        items = []
        for i, doc_id in enumerate(ids):
            items.append({
                "id": doc_id,
                "content": docs[i] if i < len(docs) else "",
                "metadata": metas[i] if i < len(metas) else {},
            })
        return items

    def core_count(self) -> int:
        try:
            self._ensure_initialized()
            return int(self._core.count())
        except Exception:
            return 0

    def delete_core_fact(self, fact_id: str) -> bool:
        try:
            self._ensure_initialized()
            self._core.delete(ids=[fact_id])
            return True
        except Exception as exc:
            log.error("Çekirdek silme hatası: %s", exc)
            return False

    # ---- istatistik ----

    def stats(self) -> dict[str, int]:
        return {
            "archive_documents": self.archive_count(),
            "core_facts": self.core_count(),
        }


# ============================================================
# ChromaDB için custom embedding fonksiyonu
# ============================================================

class _CodegaEmbeddingFunction:
    """
    ChromaDB embedding fonksiyonu adaptörü.

    ChromaDB sürümleri arasında arayüz değişti — birden fazla protokol
    desteklenir:
    - __call__(input)              → eski Chroma + chromadb.utils
    - embed_documents(texts)       → LangChain-style (yeni Chroma)
    - embed_query(text)            → LangChain-style sorgular için tek metin
    Hepsi aynı `EmbeddingService.embed()` altyapısını kullanır.
    """

    def __call__(self, input):
        """ChromaDB EmbeddingFunction — signature kesinlikle (self, input)."""
        from codegaai.core.embeddings import EmbeddingService
        svc = EmbeddingService.get()
        if not svc.is_ready:
            # Embedding yüklenmemiş — boş vektör döndür (yazma devam etsin)
            texts = [input] if isinstance(input, str) else list(input)
            return [[0.0] * 1024 for _ in texts]
        if isinstance(input, str):
            return svc.embed([input])
        return svc.embed(list(input))

    def embed_documents(self, texts):
        """LangChain-style — liste metni vektörlere çevir."""
        from codegaai.core.embeddings import EmbeddingService
        data = texts if not isinstance(texts, str) else [texts]
        return EmbeddingService.get().embed(list(data))

    def embed_query(self, text=None, **kwargs):
        """LangChain-style — hem text= hem input= kabul eder."""
        from codegaai.core.embeddings import EmbeddingService
        t = text or kwargs.get("input") or ""
        if isinstance(t, list):
            t = t[0] if t else ""
        return EmbeddingService.get().embed([str(t)])[0]

    @classmethod
    def name(cls) -> str:
        return "codega-bge-m3"
