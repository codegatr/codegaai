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
        r"(internette ara|nternette ara|webde ara|internet|web|araştır|araşt?r|güncel|guncel|son dakika)",
        r"\b(latest|current|today|news|browse|search|look up)\b",
    ]
    _SELF_PATTERNS = [
        r"\b(sen|senden|seni|sana|kendin|codega|asistan|cevabın|cevabin)\b",
    ]
    _CODE_PATTERNS = [
        r"\b(kod|hata|bug|traceback|python|php|javascript|typescript|sql)\b",
        r"\b(api|fastapi|laravel|composer|docker|github|workflow|test)\b",
    ]
    _MATH_PATTERNS = [r"\d+\s*[\+\-\*/\^]\s*\d+", r"\b(hesapla|calculate)\b"]
    _VISION_PATTERNS = [r"\b(görsel|resim|foto|image|screenshot|ekran)\b"]

    def decide(self, message: str, history: list[dict] | None = None) -> AgentDecision:
        text = str(message or "")
        low = text.lower()
        decision = AgentDecision()

        if self._matches(low, self._CODE_PATTERNS):
            decision.intent = "coding"
            decision.needs_careful_reasoning = True

        if self._matches(low, self._VISION_PATTERNS):
            decision.intent = "vision"
            decision.needs_tools.append("analyze_image")

        if self._matches(low, self._MATH_PATTERNS):
            if decision.intent == "general":
                decision.intent = "calculation"
            decision.needs_tools.append("calculate")

        if any(w in low for w in ["çalıştır", "test et", "run ", "execute"]):
            if decision.intent == "coding":
                decision.needs_tools.append("run_python")

        self_ref = self._matches(low, self._SELF_PATTERNS)
        decision.needs_web = self._matches(low, self._WEB_PATTERNS) and not (
            self_ref and "internette ara" not in low and "webde ara" not in low
        )
        if decision.needs_web:
            decision.needs_tools.append("web_search")

        # Tool execution currently happens after a full model response, so do
        # not stream when tool use is likely. This trades typing animation for
        # correctness.
        decision.needs_tools = sorted(set(decision.needs_tools))
        decision.should_stream = not decision.needs_tools
        return decision

    def guidance(self, decision: AgentDecision) -> str:
        lines = [
            "## Ajan Çalışma Modu",
            f"- Niyet: {decision.intent}",
            "- Önce son sohbet bağlamını oku, sonra bellek/RAG ve araç sonuçlarını değerlendir.",
            "- Kullanıcı belirsiz konuşuyorsa önce yakın geçmişten zamirleri çöz.",
            "- Emin olmadığın noktayı açıkça söyle; uydurma bilgi verme.",
        ]
        if decision.needs_tools:
            lines.append(
                "- Bu soruda araç gerekebilir: "
                + ", ".join(decision.needs_tools)
                + ". Gerekliyse yalnızca uygun <tool>...</tool> çağrısını kullan."
            )
        if decision.needs_careful_reasoning:
            lines.append("- Teknik işlerde kısa plan kur, sonra uygulanabilir adımlarla cevap ver.")
        return "\n".join(lines)

    def _matches(self, text: str, patterns: list[str]) -> bool:
        return any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)


_BRAIN = AgentBrain()


def decide_response(message: str, history: list[dict] | None = None) -> AgentDecision:
    return _BRAIN.decide(message, history=history)


def decision_guidance(decision: AgentDecision) -> str:
    return _BRAIN.guidance(decision)
