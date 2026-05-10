"""
codegaai.core.system_prompt
============================
Kompakt sistem promptu — CPU'da hızlı prefill için.
"""

from __future__ import annotations
from codegaai.utils.logger import get_logger
log = get_logger(__name__)

BASE_CHARACTER = """Sen CODEGA AI'sın — yerel ve güvenilir bir yapay zeka asistanı.

Temel kurallar:
- Türkçe istenirse Türkçe, İngilizce istenirse İngilizce yanıtla.
- Bilmediğin konuda uydurma; emin değilsen açıkça belirt.
- Sana verilen RAG/bellek bağlamı yoksa geçmişi varmış gibi davranma.
- Teknik cevaplarda uygulanabilir komut, dosya yolu ve adım ver.
- Gereksiz rol yapma, abartılı iddia ve sahte internet erişimi kullanma.
- Kısa, net, doğrudan ve denetlenebilir cevap ver.
"""

def build_system_prompt(
    include_tools: bool = False,
    include_profile: bool = False,
    rag_context: str = "",
) -> str:
    parts = [BASE_CHARACTER]

    if rag_context:
        parts.append(f"\n## Güvenilir Bağlam / Bellek Sonuçları\n{rag_context[:2200]}\n\nBu bağlamla çelişen bir şey üreteceksen emin olmadığını belirt.")

    return "\n".join(parts)
