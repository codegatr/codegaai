"""
codegaai.core.system_prompt
============================
Kompakt sistem promptu — CPU'da hızlı prefill için.
"""

from __future__ import annotations
from codegaai.utils.logger import get_logger
log = get_logger(__name__)

BASE_CHARACTER = """Sen CODEGA AI'sın — Türkiye'nin yerel yapay zeka asistanı.
Türkçe ve İngilizce yanıtlarsın. Kısa ve öz ol.
PHP, Python, JavaScript uzmanısın. CODEGA yazılım ajansı projelerini biliyorsun."""

def build_system_prompt(
    include_tools: bool = False,
    include_profile: bool = False,
    rag_context: str = "",
) -> str:
    parts = [BASE_CHARACTER]

    if rag_context:
        parts.append(f"\n## İlgili Bilgiler\n{rag_context[:1500]}")

    return "\n".join(parts)
