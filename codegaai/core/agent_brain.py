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
        r"(internette ara|nternette ara|webde ara|internet|web|araştır|güncel|guncel|son dakika|haber)",
        r"\b(latest|current|today|news|browse|search|look up)\b",
    ]
    _SELF_PATTERNS = [
        r"\b(sen|senden|seni|sana|kendin|codega|asistan|cevabın)\b",
    ]
    _CODE_PATTERNS = [
        r"\b(kod|hata|bug|traceback|python|php|javascript|typescript|sql)\b",
        r"\b(api|fastapi|laravel|composer|docker|github|workflow|test|fonksiyon|class|metod)\b",
        r"\b(yaz|oluştur|düzelt|refactor|optimize)\b.{0,30}\b(kod|script|fonksiyon|class)\b",
    ]
    _MATH_PATTERNS = [
        r"\d+\s*[\+\-\*/\^]\s*\d+",
        r"\b(hesapla|calculate|integral|türev|matris|istatistik)\b",
    ]
    _SHORT_QA_PATTERNS = [
        r"\b[\w\+\#\.\-]{1,40}\s+(nedir|ne demek)\b",
        r"\b(nedir|ne demek)\s+[\w\+\#\.\-]{1,40}\b",
        r"\b(nedir|ne demek)\b.{0,80}\b(tek c.mle|kisa|kisaca)\b",
        r"\b(sadece|yalnizca|only)\b.{0,40}\b(yaz|soyle|cevapla|write|say)\b",
        r"\b(kisa cevap|short answer)\b",
    ]
    _VISION_PATTERNS = [
        r"\b(görsel|resim|foto|image|screenshot|ekran|fotoğraf)\b",
    ]
    _TRANSLATE_PATTERNS = [
        r"\b(çevir|translate|tercüme|İngilizce|Almanca|Fransızca|Arapça)\b",
    ]
    _FILE_PATTERNS = [
        r"\b(dosya|zip|pdf|yükle|indir|oluştur|proje)\b",
        r"\b(file|upload|download|project|generate)\b",
    ]

    _ARCHITECTURE_PLANNING_PATTERNS = [
        r"\b(henuz|henüz|sadece|yalnizca|yalnızca)\b.*\b(kod yazma|kodlama yapma|plan|mimari|architecture)\b",
        r"\b(domain analizi|domain model|database design|api design|flutter architecture|clean architecture)\b",
        r"\b(profesyonel proje mimarisi|uygulama plani|uygulama planı|teknik tasarim|teknik tasarım)\b",
        r"\b(analysis|assumptions|domain model|database design|api design|testing plan|deployment plan)\b",
    ]

    def decide(self, message: str, history: list[dict] | None = None) -> AgentDecision:
        text = str(message or "")
        raw_low = text.lower()
        low = self._fold_tr(text)
        decision = AgentDecision()

        if self._matches(low, self._SHORT_QA_PATTERNS):
            decision.intent = "short_qa"
            decision.response_style = "short_direct"
            decision.needs_memory = False
            decision.should_stream = True

        if decision.intent == "general" and self._matches(low, self._CODE_PATTERNS):
            decision.intent = "coding"
            decision.needs_careful_reasoning = True

        if self._matches(low, self._ARCHITECTURE_PLANNING_PATTERNS):
            decision.intent = "architecture_planning"
            decision.response_style = "professional_architecture_plan"
            decision.needs_careful_reasoning = True

        if self._matches(low, self._VISION_PATTERNS):
            decision.intent = "vision"
            decision.needs_tools.append("analyze_image")

        if self._matches(low, self._MATH_PATTERNS):
            if decision.intent == "general":
                decision.intent = "calculation"
            decision.needs_tools.append("calculate")

        if self._matches(low, self._TRANSLATE_PATTERNS):
            if decision.intent == "general":
                decision.intent = "translate"

        if self._matches(low, self._FILE_PATTERNS) and decision.intent != "architecture_planning":
            decision.needs_tools.append("file_ops")

        if any(w in low for w in ["çalıştır", "test et", "run ", "execute", "koştur"]):
            if decision.intent == "coding":
                decision.needs_tools.append("run_python")
        elif decision.intent == "coding" and any(w in raw_low for w in ["çal", "çalıştır", "calistir"]):
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
        if decision.intent == "short_qa":
            decision.should_stream = True
        else:
            decision.should_stream = not decision.needs_tools
        return decision

    def guidance(self, decision: AgentDecision) -> str:
        lines = [
            "## Ajan Çalışma Modu",
            f"- Niyet: {decision.intent}",
            f"- Cevap stili: {decision.response_style}",
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
        if decision.intent == "architecture_planning":
            lines.extend([
                "- Kullanici henuz kod yazma diyorsa kesinlikle kod, dosya veya zip uretme; once profesyonel mimari ve uygulanabilir gelistirme plani hazirla.",
                "- Cevap sirasini koru: Analysis, Assumptions, Domain Model, Database Design, API Design, Laravel Architecture, Flutter Architecture, Reminder & Notification System, Security Plan, Testing Plan, Deployment Plan, Risks, First Implementation Tasks.",
                "- Once mevcut proje var mi yok mu belirt; varsayimlari ayri bolumde yaz; domain analizinden once kod onerme.",
                "- Turkce aciklama kullan; kod, tablo, endpoint, migration, class ve alan adlarinda English naming standard kullan, Turkce karakter kullanma.",
                "- Laravel icin Sanctum kullanilacak; Sanctum veya JWT diye belirsiz birakma ve JWT ile karistirma.",
                "- Arac takip sistemi istenirse su tablolari mutlaka planla: users, vehicles, traffic_insurances, casco_policies, inspections, exhaust_emissions, maintenance_records, vehicle_documents, reminders, notifications.",
                "- Her tablo icin alanlar, veri tipleri, iliskiler, indeksler, unique kurallar ve soft delete kararini belirt.",
                "- Flutter Clean Architecture bolumunde core, features, data, domain, presentation, providers ve widgets klasorlerini ver.",
                "- Hatirlatma sisteminde 30 gun, 15 gun, 7 gun ve 1 gun kala bildirim akisini planla.",
                "- Test planinda Laravel Feature Test, Laravel Unit Test, Flutter Widget Test ve API test senaryolarini ayri yaz.",
                "- Security Plan Auth, rate limit, sahiplik kontrolu, dosya yukleme guvenligi ve loglama icermeli.",
                "- Deployment Plan Docker, Nginx, MySQL, Queue Worker, Scheduler/Cron ve SSL icermeli.",
            ])
        return "\n".join(lines)

    def _matches(self, text: str, patterns: list[str]) -> bool:
        return any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)

    def _fold_tr(self, text: str) -> str:
        table = str.maketrans({
            "İ": "i", "I": "i", "ı": "i", "ğ": "g", "Ğ": "g",
            "ü": "u", "Ü": "u", "ş": "s", "Ş": "s",
            "ö": "o", "Ö": "o", "ç": "c", "Ç": "c",
        })
        return str(text or "").translate(table).casefold().replace("i̇", "i")


_BRAIN = AgentBrain()


def decide_response(message: str, history: list[dict] | None = None) -> AgentDecision:
    return _BRAIN.decide(message, history=history)


def decision_guidance(decision: AgentDecision) -> str:
    return _BRAIN.guidance(decision)
