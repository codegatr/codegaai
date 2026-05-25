"""
codegaai.core.simulation_mode
==============================

Faz 57: Simülasyon Modu — LLM yüklü olmadığında rule-based cevaplar verir.

AVX2 uyumsuzluğu vs. donanım yetersizliği gibi durumlarda uygulama tamamen
kullanılamaz hale gelmesin. Basit konuşma, bilgi tabanı sorguları, sistem
bilgisi gibi şeyler çalışmaya devam etsin.

Kullanım:
    sim = SimulationEngine.get()
    response = sim.generate_response("merhaba")
    # → "Merhaba! Şu an sınırlı moddayım..."
"""

from __future__ import annotations

import random
import re
from datetime import datetime
from typing import Optional


# Selamlama paternleri
GREETING_PATTERNS = [
    r"\b(merhaba|selam|selamlar|hi|hello|hey|hola|günaydın|iyi akşamlar|iyi geceler)\b",
]

# Soru paternleri
QUESTION_PATTERNS = {
    "nasılsın": [
        "İyiyim, sağ ol! Sen nasılsın? Şu an sınırlı modda çalışıyorum (LLM yüklü değil) ama sohbet edebiliriz.",
        "Teşekkür ederim, iyi sayılırım. Modelim henüz yüklenmediği için sınırlı yanıt verebiliyorum.",
    ],
    "kim": [
        "Ben CODEGA AI, Türk geliştirici Yunus tarafından oluşturulmuş yerel yapay zeka asistanıyım.",
        "CODEGA AI olarak yerel ortamda çalışıyorum. Şu an temel modda hizmet veriyorum.",
    ],
    "saat": [
        f"Şu an saat {datetime.now().strftime('%H:%M')}. Tarih: {datetime.now().strftime('%d %B %Y, %A')}",
    ],
    "tarih": [
        f"Bugün {datetime.now().strftime('%d %B %Y, %A')}.",
    ],
    "ne yapabilirsin": [
        "Şu an sınırlı moddayım çünkü LLM modeli yüklenemedi (genellikle CPU AVX2 uyumsuzluğu).\n\nBu durumda yapabildiklerim:\n• Basit sohbet\n• Tarih/saat bilgisi\n• Bilgi tabanı sorguları (yüklediğin notlar)\n• Web araması\n• Sistem ayarları\n\nTam özellikler için Sistem → Otomatik Onar butonunu kullanabilirsin.",
    ],
    "yardım": [
        "Şu komutları kullanabilirsin:\n\n• 'saat kaç' → Şu anki saat\n• 'tarih ne' → Bugünün tarihi\n• 'sistem durumu' → Uygulamanın durumu\n• 'onar' → Otomatik onarımı başlat\n\nVeya doğrudan herhangi bir şey sor — elimden geleni yaparım.",
    ],
}


# AVX2/CPU uyumsuzluğu açıklayan cevap
AVX2_EXPLANATION = """
🔧 **Modelim Henüz Yüklenemedi**

İşlemcin AVX2 talimat setini desteklemediği için varsayılan llama-cpp build çalışmıyor.

**Çözüm:**
1. Sistem → Otomatik Onar butonuna tıkla, veya
2. En güncel AVX'siz Windows paketini Releases sayfasından indir
3. Bittikten sonra uygulamayı yeniden başlat

Otomatik Onar, llama-cpp-python paketini AVX kapalı kaynak derleme ile yeniden kurar.
""".strip()


class SimulationEngine:
    """Rule-based fallback engine — LLM yokken kullanılır."""

    _instance: Optional["SimulationEngine"] = None

    def __init__(self):
        self._enabled = True

    @classmethod
    def get(cls) -> "SimulationEngine":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def is_active(self) -> bool:
        """LLM yüklü değilse aktif."""
        try:
            from codegaai.core.engine import LLMEngine
            return not LLMEngine.get().is_ready
        except Exception:
            return True

    def generate_response(self, query: str, context: Optional[str] = None) -> str:
        """Basit kural tabanlı cevap üret."""
        q = query.lower().strip()

        # Selamlama
        for pattern in GREETING_PATTERNS:
            if re.search(pattern, q, re.IGNORECASE):
                hour = datetime.now().hour
                if 5 <= hour < 12:
                    greeting = "Günaydın!"
                elif 12 <= hour < 18:
                    greeting = "İyi günler!"
                elif 18 <= hour < 23:
                    greeting = "İyi akşamlar!"
                else:
                    greeting = "İyi geceler!"
                return f"{greeting} 👋\n\n*Şu an sınırlı modda çalışıyorum (LLM yüklü değil). Yine de elimden geleni yaparım. 'yardım' yazarak neler yapabileceğimi öğrenebilirsin.*"

        # Sorular
        for keyword, responses in QUESTION_PATTERNS.items():
            if keyword in q:
                return random.choice(responses)

        # AVX2/CPU/onar gibi anahtar kelimeler
        if any(k in q for k in ["avx2", "cpu uyum", "model yüklen", "neden çalış", "fix_llama"]):
            return AVX2_EXPLANATION

        if "onar" in q or "repair" in q or "düzelt" in q:
            return "Otomatik onarımı başlatmak için **Sistem → Gelişmiş → Otomatik Onar** butonuna tıkla. Süreç 10-25 dakika sürebilir."

        # Bilgi tabanından bul
        kb_result = self._try_knowledge_base(query)
        if kb_result:
            return kb_result

        # Genel cevap
        return self._generic_response(query)

    def _try_knowledge_base(self, query: str) -> Optional[str]:
        """Bilgi tabanından eşleşme ara."""
        try:
            import asyncio
            from codegaai.api.routes.knowledge import search
            loop = asyncio.new_event_loop()
            try:
                result = loop.run_until_complete(search(query, limit=2))
            finally:
                loop.close()

            results = result.get("results", [])
            if results:
                top = results[0]
                if top.get("score", 0) > 0.3:
                    return f"📚 **Bilgi tabanından:**\n\n**{top['title']}**\n\n{top['content']}"
            return None
        except Exception:
            return None

    def _generic_response(self, query: str) -> str:
        """LLM olmadığında genel cevap."""
        responses = [
            f"Bu konuda detaylı yanıt veremem çünkü ana modelim henüz yüklenmedi.\n\nMevcut moddaki yeteneklerim: sohbet, tarih/saat, bilgi tabanı sorguları.\n\nTam yanıt için: **Sistem → Otomatik Onar** ile modeli aktifleştirebilirsin.",
            f"Sorduğun: \"{query[:80]}\"\n\nBuna detaylı yanıt veremem — modelim yüklenmedi (CPU AVX2 uyumsuzluğu).\n\nGeçici çözüm: bilgi tabanına benzer bir not eklediysen sana gösterebilirim. Veya 'onar' yazarak çözüm adımlarını görebilirsin.",
        ]
        return random.choice(responses)


def simulate_chat_response(query: str, history: list = None) -> dict:
    """Chat endpoint için simülasyon yanıtı."""
    engine = SimulationEngine.get()
    response = engine.generate_response(query)

    return {
        "content": response,
        "model": "simulation",
        "is_simulated": True,
        "tokens": len(response.split()),
    }
