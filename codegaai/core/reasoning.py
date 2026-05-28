"""
codegaai.core.reasoning
=========================

Zincirli Düşünme (Chain of Thought) motoru.

Claude'un en büyük farkı: yanıt vermeden ÖNCE düşünmesi.
Karmaşık sorularda adım adım akıl yürütmesi.

Bu modül:
1. Soruyu analiz et — ne istiyor, ne kadar karmaşık?
2. Gerekiyorsa CoT prompt'u ekle (düşünce zinciri)
3. Yanıtı yapılandır (düşünce görünür/gizli)
4. Güven seviyesini değerlendir
5. Belirsizliği kabul et

Kullanım:
    from codegaai.core.reasoning import ReasoningEngine
    engine = ReasoningEngine.get()
    result = engine.reason(question, context)
    # result.thought (iç akıl yürütme)
    # result.answer (son yanıt)
    # result.confidence (0-1)
    # result.needs_tools (araç gerekiyor mu)
"""

from __future__ import annotations

import re
import threading
from dataclasses import dataclass, field
from typing import Optional

from codegaai.utils.logger import get_logger

log = get_logger(__name__)


# ============================================================
# Soru Kategorileri
# ============================================================

QUESTION_CATEGORIES = {
    "factual": [
        r"\b(ne|nedir|kim|nerede|ne zaman|kaç|hangi)\b",
        r"\b(what|who|where|when|how many|which)\b",
    ],
    "reasoning": [
        r"\b(neden|nasıl|niçin|açıkla|anlat|karşılaştır)\b",
        r"\b(why|how|explain|compare|analyze)\b",
    ],
    "math": [
        r"\b(hesapla|çöz|bul|kanıtla|ispat)\b",
        r"\b(calculate|solve|find|prove|compute)\b",
        r"\d+[\+\-\*\/\^]\d+",
    ],
    "code": [
        r"\b(yaz|kod|program|fonksiyon|class|debug|hata)\b",
        r"\b(write|code|program|function|debug|error|bug)\b",
        r"```|def |class |import |<\?php|function ",
    ],
    "creative": [
        r"\b(yaz|oluştur|üret|hayal|hikaye|şiir|senaryo)\b",
        r"\b(write|create|generate|imagine|story|poem|script)\b",
    ],
    "opinion": [
        r"\b(düşünüyor musun|görüşün|fikrin|önerir misin|tavsiye)\b",
        r"\b(think|opinion|recommend|suggest|advice|best)\b",
    ],
    "multi_step": [
        r"\b(önce|sonra|ardından|adım|aşama|sırasıyla)\b",
        r"\b(first|then|next|step|stage|sequentially)\b",
    ],
}


def classify_question(question: str) -> list[str]:
    """Soruyu kategorilere ayır."""
    categories = []
    q_lower = question.lower()

    for cat, patterns in QUESTION_CATEGORIES.items():
        for p in patterns:
            if re.search(p, q_lower, re.IGNORECASE):
                if cat not in categories:
                    categories.append(cat)
                break

    return categories or ["general"]


def needs_chain_of_thought(question: str, categories: list[str]) -> bool:
    """CoT gerekiyor mu?"""
    cot_cats = {"reasoning", "math", "code", "multi_step"}
    return bool(cot_cats & set(categories)) or len(question.split()) > 30


# ============================================================
# CoT System Prompt Eklentisi
# ============================================================

COT_INSTRUCTION = """
## Düşünce Süreci

Yanıtlamadan önce ÖNCE düşün. Karmaşık sorular için:

<thinking>
1. Soruyu anla: Ne isteniyor?
2. Bilgi tarama: Ne biliyorum?
3. Adım adım çözüm planı
4. Olası hatalar ve kontroller
5. Sonuç
</thinking>

Düşünce sürecini <thinking>...</thinking> içine yaz.
Sonra net, yapılandırılmış yanıtı ver.

Bilmiyorsan: "Bilmiyorum" veya "Emin değilim" de. Uydurma.
"""

UNCERTAINTY_PHRASES = [
    "sanırım", "galiba", "belki", "muhtemelen",
    "i think", "maybe", "probably", "i believe",
    "not sure", "emin değilim", "tam olarak bilmiyorum",
]

CONFIDENCE_KILLERS = [
    "kesinlikle", "mutlaka", "her zaman", "asla",
    "absolutely", "definitely", "always", "never",
]


@dataclass
class ReasoningResult:
    question: str
    categories: list[str]
    thought: str = ""          # İç akıl yürütme (<thinking> içeriği)
    answer: str = ""           # Final yanıt
    confidence: float = 1.0   # 0-1 arası güven
    needs_tools: list[str] = field(default_factory=list)  # Hangi araçlar?
    used_cot: bool = False


class ReasoningEngine:
    """Zincirli düşünme motoru. Singleton."""

    _instance: Optional["ReasoningEngine"] = None
    _lock = threading.Lock()

    @classmethod
    def get(cls) -> "ReasoningEngine":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def build_messages(
        self,
        question: str,
        history: list[dict],
        system_prompt: str,
        rag_context: str = "",
        force_cot: bool = False,
    ) -> tuple[list[dict], ReasoningResult]:
        """
        Mesaj listesini oluştur, CoT gerekiyorsa ekle.
        Dönüş: (messages, reasoning_result)
        """
        cats = classify_question(question)
        use_cot = force_cot or needs_chain_of_thought(question, cats)
        needs_tools = self._detect_tool_needs(question, cats)

        result = ReasoningResult(
            question=question,
            categories=cats,
            used_cot=use_cot,
            needs_tools=needs_tools,
        )

        # System prompt oluştur
        full_system = system_prompt
        if rag_context:
            full_system += f"\n\n## Bilgi Tabanı\n{rag_context}"
        if use_cot:
            full_system += f"\n\n{COT_INSTRUCTION}"

        try:
            from codegaai.core.frontier_capabilities import (
                build_capability_prompt,
                plan_capabilities,
            )
            full_system += f"\n\n{build_capability_prompt(plan_capabilities(question))}"
        except Exception:
            pass

        # Tool ihtiyacı varsa system prompt'a ekle
        if needs_tools:
            full_system += (
                f"\n\n**Not:** Bu soru için şu araçları kullanman gerekebilir: "
                f"{', '.join(needs_tools)}"
            )

        messages = [{"role": "system", "content": full_system}]
        messages.extend(history)
        messages.append({"role": "user", "content": question})

        return messages, result

    def extract_thought(self, response: str) -> tuple[str, str]:
        """
        Yanıttan <thinking>...</thinking> bloğunu çıkar.
        Dönüş: (thought, clean_answer)
        """
        thought_match = re.search(
            r"<thinking>(.*?)</thinking>",
            response,
            re.DOTALL | re.IGNORECASE,
        )

        if thought_match:
            thought = thought_match.group(1).strip()
            # Düşünce bloğunu yanıttan temizle
            clean = re.sub(
                r"<thinking>.*?</thinking>\s*",
                "",
                response,
                flags=re.DOTALL | re.IGNORECASE,
            ).strip()
            return thought, clean

        return "", response

    def estimate_confidence(self, response: str) -> float:
        """Yanıttan güven seviyesini tahmin et."""
        lower = response.lower()

        # Belirsizlik ifadeleri → güveni düşür
        uncertainty_count = sum(
            1 for p in UNCERTAINTY_PHRASES
            if p in lower
        )

        # Kesinlik ifadeleri → güveni artır (ama dikkatli ol)
        confidence_count = sum(
            1 for p in CONFIDENCE_KILLERS
            if p in lower
        )

        # Yanıt çok kısa → güvensiz
        length_factor = min(1.0, len(response.split()) / 50)

        confidence = 1.0
        confidence -= uncertainty_count * 0.15
        confidence -= (1 - length_factor) * 0.2
        confidence = max(0.1, min(1.0, confidence))

        return round(confidence, 2)

    def _detect_tool_needs(
        self,
        question: str,
        categories: list[str],
    ) -> list[str]:
        """Soru için hangi araçlar gerekli?"""
        tools = []
        q = question.lower()

        # Web araması
        if any(w in q for w in [
            "güncel", "son", "bugün", "haber", "şimdi", "yeni",
            "current", "latest", "today", "news", "now", "recent",
        ]):
            tools.append("web_search")

        # Hesaplama
        if "math" in categories or re.search(r"\d+[\+\-\*\/\^]\d+", q):
            tools.append("calculate")

        # Kod çalıştırma
        if "code" in categories and any(
            w in q for w in ["çalıştır", "test et", "run", "execute"]
        ):
            tools.append("run_python")

        # Hava durumu
        if any(w in q for w in ["hava", "weather", "sıcaklık", "temperature"]):
            tools.append("weather")

        return tools
