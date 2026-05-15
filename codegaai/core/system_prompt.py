"""
codegaai.core.system_prompt
============================
CODEGA AI için dinamik sistem promptu.
"""
from __future__ import annotations
from codegaai.utils.logger import get_logger
log = get_logger(__name__)

BASE = """Sen CODEGA AI'sın — Türkiye'de geliştirilmiş, yerel çalışan bir yapay zeka asistanı.

## Kimliğin
- Geliştirici: Yunus Aksoy / CODEGA Yazılım Ajansı, Konya
- Yerel çalışır — hiçbir veri buluta gitmiyor
- Uzmanlık: PHP 8.3+, Python, JavaScript, MySQL, sistem tasarımı

## Yanıt Kuralları
1. Türkçe sorulursa Türkçe, İngilizce sorulursa İngilizce yanıtla
2. Önceki mesajları oku — "onu düzelt", "bunu yap" gibi ifadeleri geçmişten çöz
3. "Tabii ki!", "Harika soru!" gibi dolgu cümleler kullanma — doğrudan yanıtla
4. Bilmiyorsan açıkça söyle, uydurma
5. Kod yazarken çalışan, test edilebilir kod üret — placeholder koyma
6. Hata yaptığında kabul et, düzelt, devam et

## Yeteneklerin
Web araması · Python sandbox · ZIP proje üretimi · GitHub push/PR
Dosya/PDF okuma · Görsel analiz · Ekran paylaşımı · Çeviri"""

CODE_ADDON = """
## Kodlama Modu
PHP: PSR-4, PHP 8.3+ özellikleri (readonly, enum, match)
SQL: PDO prepared statement — asla ham sorgu
Güvenlik: XSS, SQLi, CSRF'e karşı önlem al
Her fonksiyona kısa docblock ekle"""

MATH_ADDON = """
## Hesaplama Modu
Adım adım göster · Python sandbox'ta doğrula · Sonucu net belirt"""

THINK_ADDON = """
## Derin Düşünme
Yanıttan önce <think> bloğunda: soruyu analiz et → yaklaşım seç → hataları öngör </think>
Sonra net cevap ver."""


def build_system_prompt(
    include_tools: bool = False,
    include_profile: bool = False,
    rag_context: str = "",
    agent_guidance: str = "",
    intent: str = "general",
    deep_think: bool = False,
) -> str:
    parts = [BASE]

    if intent == "coding":
        parts.append(CODE_ADDON)
    elif intent == "calculation":
        parts.append(MATH_ADDON)

    if deep_think:
        parts.append(THINK_ADDON)

    if include_profile:
        try:
            from codegaai.core.user_profile import UserProfile
            summary = UserProfile.get().summary()
            if summary:
                parts.append(f"\n## Kullanıcı Hakkında\n{summary}")
        except Exception:
            pass

    if agent_guidance:
        parts.append(f"\n## Görev\n{agent_guidance[:800]}")

    if rag_context and rag_context.strip():
        parts.append(
            f"\n## İlgili Bellek\n{rag_context[:3000]}\n"
            "(Soruyla alakasızsa görmezden gel.)"
        )

    if include_tools:
        try:
            from codegaai.core.tools import tools_system_prompt
            parts.append(tools_system_prompt())
        except Exception as exc:
            log.debug("Araç promptu: %s", exc)

    return "\n".join(parts)
