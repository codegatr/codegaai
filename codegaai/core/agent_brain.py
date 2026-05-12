"""
codegaai.core.agent_brain
=========================

Small deterministic planning layer for CODEGA AI.

Local LLMs are much stronger when the application decides what context and
tools they should receive before generation. This module is intentionally
rule-based and fast: it does not replace the model, it gives the model a
better operating envelope.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class AgentDecision:
    intent: str = "general"
    response_style: str = "natural"
    needs_web: bool = False
    needs_memory: bool = True
    needs_tools: list[str] = field(default_factory=list)
    needs_careful_reasoning: bool = False
    should_stream: bool = True

    @property
    def uses_tools(self) -> bool:
        return bool(self.needs_tools)


class AgentBrain:
    """Fast intent and tool planner used before chat generation."""

    _WEB_PATTERNS = [
        r"https?://",
        r"(internette ara|nternette ara|webde ara|internet|web|arastir|araştır|guncel|güncel|son dakika)",
        r"\b(latest|current|today|news|browse|search|look up)\b",
    ]
    _SELF_PATTERNS = [
        r"\b(sen|senden|seni|sana|kendin|codega|asistan|cevabin|cevabın)\b",
    ]
    _CODE_PATTERNS = [
        r"\b(kod|hata|bug|traceback|python|php|javascript|typescript|sql)\b",
        r"\b(api|fastapi|laravel|composer|docker|github|workflow|test)\b",
    ]
    _PROJECT_GENERATION_PATTERNS = [
        r"https?://.*\b(incele|analiz et|benzer|hazirla|hazırla|olustur|oluştur|yap|uret|üret)\b",
        r"\b(proje|web sitesi|web sayfasi|web sayfası|website|site|sistem|uygulama)\b.*\b(olustur|oluştur|yap|hazirla|hazırla|uret|üret)\b",
        r"\b(olustur|oluştur|yap|hazirla|hazırla|uret|üret)\b.*\b(proje|web sitesi|web sayfasi|web sayfası|website|site|sistem|uygulama)\b",
        r"\b(zip|dosyalari|dosyaları|veritabani|veritabanı|schema|sql)\b.*\b(ver|hazirla|hazırla|olustur|oluştur)\b",
        r"\b(php\s*8\.?3|php)\b.*\b(veritabani|veritabanı|sql|zip)\b",
    ]
    _MATH_PATTERNS = [r"\d+\s*[\+\-\*/\^]\s*\d+", r"\b(hesapla|calculate)\b"]
    _VISION_PATTERNS = [r"\b(gorsel|görsel|resim|foto|image|screenshot|ekran)\b"]
    _IMPLICIT_REASONING_PATTERNS = [
        r"\b(mantik|mantık|akil yurut|akıl yürüt|dusun|düşün|dusunce|düşünce|analiz)\b",
        r"\b(leb|leblebi|ima|ne demek istedim|anlaman gerek|algilaman|algılaman)\b",
        r"\b(arkadasim|arkadaşım|dedi|sorsan|bilmez|bilmiyor)\b",
        r"\b(reason|infer|implicit|think|understand)\b",
    ]
    _CONVERSATIONAL_PATTERNS = [
        r"^(gunaydin|günaydın|selam|merhaba|iyi aksamlar|iyi akşamlar)\b",
        r"\b(arkadas gibi|arkadaş gibi|insan gibi|dogal|doğal|samimi|sohbet)\b",
    ]

    def decide(self, message: str, history: list[dict] | None = None) -> AgentDecision:
        text = str(message or "")
        low = text.lower()
        decision = AgentDecision()

        if self._matches(low, self._CODE_PATTERNS):
            decision.intent = "coding"
            decision.needs_careful_reasoning = True

        if self._matches(low, self._PROJECT_GENERATION_PATTERNS):
            decision.intent = "project_generation"
            decision.response_style = "action_first"
            decision.needs_careful_reasoning = True
            decision.needs_tools.append("generate_project")

        if self._matches(low, self._VISION_PATTERNS):
            decision.intent = "vision"
            decision.needs_tools.append("analyze_image")

        if self._matches(low, self._MATH_PATTERNS):
            if decision.intent == "general":
                decision.intent = "calculation"
            decision.needs_tools.append("calculate")

        if self._matches(low, self._IMPLICIT_REASONING_PATTERNS) and decision.intent != "project_generation":
            decision.intent = "implicit_context"
            decision.response_style = "human_inference"
            decision.needs_careful_reasoning = True

        if self._matches(low, self._CONVERSATIONAL_PATTERNS):
            decision.response_style = "warm_conversation"

        if history:
            recent = " ".join(str(h.get("content", "")) for h in history[-6:]).lower()
            if any(w in recent for w in ["mantik", "mantık", "düşün", "dusun", "insan gibi"]):
                decision.needs_careful_reasoning = True
                if decision.intent == "general":
                    decision.intent = "implicit_context"
                decision.response_style = "human_inference"

        if any(w in low for w in ["calistir", "çalıştır", "test et", "run ", "execute"]):
            if decision.intent == "coding":
                decision.needs_tools.append("run_python")

        self_ref = self._matches(low, self._SELF_PATTERNS)
        decision.needs_web = self._matches(low, self._WEB_PATTERNS) and not (
            self_ref and "internette ara" not in low and "webde ara" not in low
        )
        if decision.needs_web:
            decision.needs_tools.append("web_search")

        decision.needs_tools = sorted(set(decision.needs_tools))
        decision.should_stream = not decision.needs_tools
        return decision

    def guidance(self, decision: AgentDecision) -> str:
        lines = [
            "## Ajan Calisma Modu",
            f"- Niyet: {decision.intent}",
            f"- Cevap stili: {decision.response_style}",
            "- Once son sohbet baglamini oku, sonra bellek/RAG ve arac sonuclarini degerlendir.",
            "- Kullanici belirsiz konusuyorsa once yakin gecmisten zamirleri coz.",
            "- Kullanici dolayli bir test yapiyorsa once imayi coz, sonra dogrudan cevap ver.",
            "- Genel yardim teklifiyle kacma; kullanicinin sordugu seye cevap ver.",
            "- Emin olmadigin noktayi acikca soyle; uydurma bilgi verme.",
        ]
        if decision.needs_tools:
            lines.append(
                "- Bu soruda arac gerekebilir: "
                + ", ".join(decision.needs_tools)
                + ". Gerekliyse yalnizca uygun <tool>...</tool> cagrisini kullan."
            )
        if decision.intent == "project_generation":
            lines.append(
                "- Kullanici proje/dosya/zip istiyorsa plan anlatmakla yetinme; "
                "dosya uretme aksiyonunu baslat ve indirme linki ver."
            )
        if decision.needs_careful_reasoning:
            lines.append(
                "- Cevaptan once icinden kisa analiz yap; analizini kullaniciya acma. "
                "Son cevap dogal, net ve baglama uygun olsun."
            )
        return "\n".join(lines)

    def _matches(self, text: str, patterns: list[str]) -> bool:
        return any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)


_BRAIN = AgentBrain()


def decide_response(message: str, history: list[dict] | None = None) -> AgentDecision:
    return _BRAIN.decide(message, history=history)


def decision_guidance(decision: AgentDecision) -> str:
    return _BRAIN.guidance(decision)
