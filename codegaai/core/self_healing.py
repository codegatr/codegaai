"""
codegaai.core.self_healing
============================

Otonom Kendini Onarma Sistemi.

Sistem hata algıladığında otomatik düzeltme adımları dener:
- LLM yüklü değil → indirilmiş modeli otomatik yükle
- Embedding hatası → BGE-M3 yeniden yükle
- ChromaDB hatası → koleksiyonu yeniden oluştur
- Memory hatası → ChromaDB sıfırla
- Engine stuck → lock serbest bırak, yeniden başlat

Hata → Teşhis → Çözüm → Log → Retry
"""

from __future__ import annotations

import threading
import time
from typing import Optional

from codegaai.utils.logger import get_logger

log = get_logger(__name__)


class SelfHealing:
    """Otonom kendini onarma. Singleton."""

    _instance: Optional["SelfHealing"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._repair_history: list[dict] = []
        self._in_repair = False

    @classmethod
    def get(cls) -> "SelfHealing":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def report_error(self, component: str, error: str, auto_fix: bool = True) -> None:
        """
        Hata raporla. auto_fix=True ise otomatik düzeltmeyi dene.
        """
        entry = {
            "ts": time.time(),
            "component": component,
            "error": str(error)[:200],
            "fixed": False,
        }
        self._repair_history.append(entry)
        log.warning("[Kendini Onarma] %s hatası: %s", component, error[:80])

        if auto_fix and not self._in_repair:
            threading.Thread(
                target=self._try_repair,
                args=(component, error, entry),
                daemon=True,
                name=f"self-heal-{component}",
            ).start()

    def _try_repair(self, component: str, error: str, entry: dict) -> None:
        self._in_repair = True
        try:
            fixed = False

            if component == "llm" or "LLM" in error or "yüklü değil" in error:
                fixed = self._repair_llm()

            elif component == "embedding" or "embed" in error.lower():
                fixed = self._repair_embedding()

            elif component == "memory" or "chromadb" in error.lower() or "chroma" in error.lower():
                fixed = self._repair_memory()

            elif component == "chat" or "chat" in component:
                # Chat hatası → LLM'yi kontrol et
                fixed = self._repair_llm()

            entry["fixed"] = fixed
            if fixed:
                log.info("[Kendini Onarma] OK %s düzeltildi", component)
            else:
                log.warning("[Kendini Onarma] FAIL %s düzeltilemedi", component)

        except Exception as exc:
            log.warning("[Kendini Onarma] Exception: %s", exc)
        finally:
            self._in_repair = False

    def _repair_llm(self) -> bool:
        """LLM yüklü değilse indirilmiş modeli yükle."""
        try:
            from codegaai.core.engine import LLMEngine
            from codegaai.core.models_registry import ModelRegistry

            engine = LLMEngine.get()
            if engine.is_ready:
                return True  # Zaten çalışıyor

            # DLL hatası varsa tekrar deneme anlamsız
            err = str(engine.status.get("error", ""))
            if "llama.dll" in err or "dynlib" in err or "fix_llama" in err:
                log.warning(
                    "[Kendini Onarma] DLL hatası — tekrar deneme yok. "
                    "fix_llama.bat dosyasini calistirin."
                )
                return False

            reg = ModelRegistry.get()
            for m in reg.list_llm_models():
                if reg.is_llm_downloaded(m["id"]):
                    log.info("[Kendini Onarma] LLM yükleniyor: %s", m["id"])
                    engine.load(m["id"])
                    return engine.is_ready

            log.warning("[Kendini Onarma] İndirilmiş model yok")
            return False
        except Exception as e:
            log.warning("[Kendini Onarma] LLM onarım hatası: %s", e)
            return False

    def _repair_embedding(self) -> bool:
        """Embedding yüklü değilse yeniden yükle."""
        try:
            from codegaai.core.embeddings import EmbeddingService
            from codegaai.core.models_registry import ModelRegistry

            emb = EmbeddingService.get()
            if emb.is_ready:
                return True

            reg = ModelRegistry.get()
            if reg.is_embedding_downloaded("bge-m3"):
                log.info("[Kendini Onarma] BGE-M3 yeniden yükleniyor")
                emb.load("bge-m3")
                return emb.is_ready

            return False
        except Exception as e:
            log.warning("[Kendini Onarma] Embedding onarım hatası: %s", e)
            return False

    def _repair_memory(self) -> bool:
        """ChromaDB koleksiyonunu sıfırla ve yeniden oluştur."""
        try:
            from codegaai.core.memory import MemoryStore
            # Singleton'ı sıfırla → yeniden init
            MemoryStore._instance = None
            MemoryStore._initialized = False if hasattr(MemoryStore, '_initialized') else None
            MemoryStore.open()
            log.info("[Kendini Onarma] MemoryStore yeniden başlatıldı")
            return True
        except Exception as e:
            log.warning("[Kendini Onarma] Memory onarım hatası: %s", e)
            return False

    @property
    def repair_log(self) -> list[dict]:
        return self._repair_history[-20:]

    @property
    def is_repairing(self) -> bool:
        return self._in_repair
