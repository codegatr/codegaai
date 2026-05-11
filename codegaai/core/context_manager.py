"""
codegaai.core.context_manager
==============================

Uzun Bağlam Yönetimi — Sohbet Sıkıştırma.

Qwen 2.5'in 32K token limiti var. Uzun sohbetlerde:
1. Önceki mesajları LLM ile özetle
2. Kritik bilgileri koru
3. RAG'a ekle (bellek olarak)
4. Yeni mesajlara yer aç

Claude'da da benzer bir mekanizma var — bağlamı akıllıca yönetir.

Strateji:
- İlk 2 + son 8 mesaj her zaman korunur (sliding window)
- Ortadaki mesajlar özetlenir
- Özetler RAG'a kaydedilir → ileride geri çağrılabilir
- Token sayısı sürekli izlenir
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Optional

from codegaai.utils.logger import get_logger

log = get_logger(__name__)

# Token tahmin: Türkçe metinde 4 char/token çoğu zaman iyimser kalır.
# Tokenizer yüklenemediğinde güvenli tarafta kalmak için 3 char/token kullanılır.
CHARS_PER_TOKEN = 3
MAX_CONTEXT_TOKENS = 28_000   # 32K limitinin altında güvenli alan
SUMMARY_THRESHOLD_TOKENS = 20_000  # Bu aşılınca özetle
KEEP_FIRST = 2    # İlk N mesajı her zaman koru (sistem bağlamı)
KEEP_LAST = 10    # Son N mesajı her zaman koru (aktif konuşma)


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    try:
        from codegaai.core.engine import LLMEngine
        model_id = LLMEngine.get().status.get("model_id")
        if model_id:
            from codegaai.core.models_registry import ModelRegistry
            spec = ModelRegistry.get().get_llm_spec(model_id)
            if spec and getattr(spec, "hf_repo", None):
                from transformers import AutoTokenizer  # type: ignore
                tok = AutoTokenizer.from_pretrained(spec.hf_repo)
                return len(tok.encode(text))
    except Exception:
        pass
    return max(1, len(text) // CHARS_PER_TOKEN)


def estimate_messages_tokens(messages: list[dict]) -> int:
    return sum(
        estimate_tokens(m.get("content", ""))
        for m in messages
    )


@dataclass
class ContextResult:
    messages: list[dict]
    total_tokens: int
    was_compressed: bool
    summary: str = ""
    dropped_count: int = 0


class ContextManager:
    """Sohbet bağlamı yöneticisi. Singleton."""

    _instance: Optional["ContextManager"] = None
    _lock = threading.Lock()

    @classmethod
    def get(cls) -> "ContextManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def prepare_context(
        self,
        messages: list[dict],
        system_prompt: str = "",
    ) -> ContextResult:
        """
        Mesajları context penceresi için hazırla.
        Gerekirse sıkıştır.
        """
        # System prompt token'ını hesaba kat
        sys_tokens = estimate_tokens(system_prompt)
        msg_tokens = estimate_messages_tokens(messages)
        total = sys_tokens + msg_tokens

        if total <= SUMMARY_THRESHOLD_TOKENS:
            return ContextResult(
                messages=messages,
                total_tokens=total,
                was_compressed=False,
            )

        # Sıkıştırma gerekiyor
        return self._compress(messages, system_prompt, total)

    def _compress(
        self,
        messages: list[dict],
        system_prompt: str,
        current_tokens: int,
    ) -> ContextResult:
        """Ortadaki mesajları özetle."""
        if len(messages) <= KEEP_FIRST + KEEP_LAST:
            # Çok az mesaj var, olduğu gibi kullan
            return ContextResult(
                messages=messages,
                total_tokens=current_tokens,
                was_compressed=False,
            )

        # Ortadaki mesajları bul
        first_messages = messages[:KEEP_FIRST]
        last_messages = messages[-KEEP_LAST:]
        middle_messages = messages[KEEP_FIRST:-KEEP_LAST]

        if not middle_messages:
            return ContextResult(
                messages=messages,
                total_tokens=current_tokens,
                was_compressed=False,
            )

        # Ortaları özetle
        summary = self._summarize_messages(middle_messages)

        # Özet mesajı oluştur
        summary_msg = {
            "role": "system",
            "content": (
                f"[ÖNCEKİ SOHBET ÖZETİ]\n{summary}\n"
                "[Özet sonu — sohbet devam ediyor]"
            ),
        }

        # Yeni mesaj listesi
        compressed = first_messages + [summary_msg] + last_messages
        new_tokens = estimate_messages_tokens(compressed) + estimate_tokens(system_prompt)

        # RAG'a kaydet (opsiyonel)
        self._save_to_rag(summary)

        log.info(
            "Bağlam sıkıştırıldı: %d → %d token, %d mesaj özetlendi",
            current_tokens, new_tokens, len(middle_messages),
        )

        return ContextResult(
            messages=compressed,
            total_tokens=new_tokens,
            was_compressed=True,
            summary=summary,
            dropped_count=len(middle_messages),
        )

    def _summarize_messages(self, messages: list[dict]) -> str:
        """Mesajları LLM ile özetle."""
        try:
            from codegaai.core.engine import LLMEngine
            engine = LLMEngine.get()

            if not engine.is_ready:
                return self._simple_summary(messages)

            # Mesajları metin olarak formatla
            text = "\n".join(
                f"{m['role'].upper()}: {m.get('content', '')[:500]}"
                for m in messages
            )

            prompt_messages = [
                {
                    "role": "system",
                    "content": (
                        "Sohbet özetleyicisin. Verilen sohbet parçasını "
                        "Türkçe, kısa ve bilgi kaybetmeden özetle. "
                        "Önemli kararlar, sonuçlar ve olgular korunsun."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Bu sohbeti özetle:\n\n{text}",
                },
            ]

            result = engine.generate(prompt_messages, use_tools=False)
            return result.get("content", self._simple_summary(messages))

        except Exception as exc:
            log.warning("Özetleme hatası: %s", exc)
            return self._simple_summary(messages)

    def _simple_summary(self, messages: list[dict]) -> str:
        """Fallback: basit metin özeti."""
        parts = []
        for m in messages:
            role = m.get("role", "unknown")
            content = m.get("content", "")[:200]
            parts.append(f"{role}: {content}...")
        return "\n".join(parts)

    def _save_to_rag(self, summary: str) -> None:
        """Özeti RAG belleğine kaydet."""
        try:
            from codegaai.core.memory import MemoryStore
            MemoryStore.get().add(
                text=f"[Sohbet Özeti - {time.strftime('%Y-%m-%d %H:%M')}]\n{summary}",
                metadata={
                    "source": "context_compression",
                    "type": "conversation_summary",
                },
                collection="archive",
            )
        except Exception:
            pass
