"""
codegaai.core
=============

Çekirdek motorlar — LLM, bellek, embedding, model yönetimi.

Faz 3'ten itibaren aktif. Tüm modüller lazy-import kullanır:
ağır ML kütüphaneleri sadece motor yüklenirken çekilir.

Public:
    ChatStore           — SQLite sohbet kalıcılığı (Faz 2.1)
    ModelRegistry       — model kataloğu + indirme yöneticisi (Faz 3)
    LLMEngine           — llama-cpp-python wrapper (Faz 3)
    EmbeddingService    — BGE-M3 embedding (Faz 3)
    MemoryStore         — ChromaDB tabanlı RAG (Faz 3)
"""

from codegaai.core.chat_store import ChatStore

# Aşağıdakiler lazy — import ettiğinizde ağır kütüphaneler çekilmez,
# sadece sınıf nesnelerinin kendisi gelir.
from codegaai.core.models_registry import ModelRegistry
from codegaai.core.engine import LLMEngine, GenerationConfig, DEFAULT_SYSTEM_PROMPT
from codegaai.core.embeddings import EmbeddingService
from codegaai.core.memory import MemoryStore
from codegaai.core.image_engine import ImageEngine
from codegaai.core.audio_engine import TTSEngine, ASREngine
from codegaai.core.video_engine import VideoEngine

__all__ = [
    "ChatStore",
    "ModelRegistry",
    "LLMEngine",
    "GenerationConfig",
    "DEFAULT_SYSTEM_PROMPT",
    "EmbeddingService",
    "MemoryStore",
    "ImageEngine",
    "TTSEngine",
    "ASREngine",
    "VideoEngine",
]
