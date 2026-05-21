"""
codegaai.core.agent_platform
============================

Multi-model agent platform core.

CODEGA AI should not pretend that one local model can solve every task.
This module builds the planning layer around strong base models, local
models, RAG memory, tools, specialist profiles, and safety rules.
"""

from __future__ import annotations

import os
import re
from dataclasses import asdict, dataclass, field
from typing import Any

from codegaai.core.agent_brain import decide_response


@dataclass(frozen=True)
class ProviderSpec:
    id: str
    label: str
    kind: str
    strengths: list[str]
    context_tokens: int
    env_key: str = ""

    @property
    def configured(self) -> bool:
        return not self.env_key or bool(os.environ.get(self.env_key))


@dataclass(frozen=True)
class SpecialistProfile:
    id: str
    label: str
    triggers: list[str]
    preferred_models: list[str]
    tools: list[str]
    system_note: str


@dataclass(frozen=True)
class ToolPolicy:
    safe_tools: list[str]
    approval_required_tools: list[str]
    blocked_prompt_sources: list[str]
    secret_patterns: list[str]


@dataclass
class AgentBlueprint:
    intent: str
    specialist: str
    provider_chain: list[str]
    tools: list[str]
    memory_sources: list[str]
    approval_required: list[str] = field(default_factory=list)
    security_notes: list[str] = field(default_factory=list)
    redacted_prompt: str = ""
    execution_plan: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


PROVIDERS: list[ProviderSpec] = [
    ProviderSpec("openai:gpt-5", "OpenAI GPT-5", "cloud", ["complex_reasoning", "coding", "tool_calling", "vision"], 400_000, "OPENAI_API_KEY"),
    ProviderSpec("openai:gpt-4.1", "OpenAI GPT-4.1", "cloud", ["long_context", "tool_calling", "codebase_analysis"], 1_000_000, "OPENAI_API_KEY"),
    ProviderSpec("anthropic:claude", "Anthropic Claude", "cloud", ["coding", "long_context", "analysis"], 200_000, "ANTHROPIC_API_KEY"),
    ProviderSpec("google:gemini", "Google Gemini", "cloud", ["vision", "long_context", "multimodal"], 1_000_000, "GOOGLE_API_KEY"),
    ProviderSpec("local:qwen-coder", "Local Qwen Coder", "local", ["offline_coding", "privacy", "local_files"], 32_768),
    ProviderSpec("local:qwen", "Local Qwen", "local", ["offline_chat", "turkish", "privacy"], 32_768),
    ProviderSpec("local:vision", "Local Vision Model", "local", ["image_understanding", "ocr", "privacy"], 8_192),
]


SPECIALISTS: list[SpecialistProfile] = [
    SpecialistProfile(
        "php_directadmin",
        "PHP 8.3 / DirectAdmin Uzmani",
        ["php", "directadmin", "cpanel", "laravel", "wordpress", "composer", "mysql", "nginx", "apache"],
        ["openai:gpt-5", "anthropic:claude", "local:qwen-coder"],
        ["web_search", "read_url", "recall", "run_python"],
        "PHP 8.3, DirectAdmin, hosting, deployment ve veritabani sorunlarinda adim adim ilerle.",
    ),
    SpecialistProfile(
        "play_console_aab",
        "Play Console / AAB Uzmani",
        ["play console", "aab", "android", "keystore", "gradle", "google play"],
        ["openai:gpt-5", "google:gemini", "local:qwen-coder"],
        ["web_search", "read_url", "recall"],
        "Android release, signing, Play Console ve AAB sureclerinde kontrol listesi kullan.",
    ),
    SpecialistProfile(
        "docker_ubuntu",
        "Docker / Ubuntu Uzmani",
        ["docker", "ubuntu", "linux", "systemd", "nginx", "ssh", "vps", "deploy"],
        ["openai:gpt-5", "anthropic:claude", "local:qwen-coder"],
        ["web_search", "read_url", "recall", "run_python"],
        "Sunucu komutlarini risklerine gore ayir, destructive islemleri onaysiz calistirma.",
    ),
    SpecialistProfile(
        "erp_finance",
        "ERP / Cari Takip Uzmani",
        ["erp", "cari", "fatura", "stok", "muhasebe", "tahsilat", "irsaliye"],
        ["openai:gpt-4.1", "openai:gpt-5", "local:qwen"],
        ["recall", "calculate", "remember"],
        "Is akisi, veri modeli, raporlama ve muhasebe tutarliligina dikkat et.",
    ),
    SpecialistProfile(
        "crypto_security",
        "Kripto Borsa Guvenlik Uzmani",
        ["kripto", "borsa", "wallet", "withdraw", "hot wallet", "cold wallet", "api key"],
        ["openai:gpt-5", "anthropic:claude", "local:qwen-coder"],
        ["web_search", "read_url", "recall", "calculate"],
        "Guvenlik, yetkilendirme, rate limit ve anahtar saklama konularini one al.",
    ),
    SpecialistProfile(
        "seo_corporate",
        "SEO / Kurumsal Metin Uzmani",
        ["seo", "kurumsal", "metin", "landing", "blog", "icerik", "reklam"],
        ["openai:gpt-4.1", "openai:gpt-5", "local:qwen"],
        ["web_search", "read_url", "recall"],
        "Marka dili, arama niyeti, baslik hiyerarsisi ve donusum hedefini birlikte dusun.",
    ),
    SpecialistProfile(
        "stl_3d_print",
        "3D Baski / STL Yardimcisi",
        ["stl", "3d baski", "printer", "slicer", "filament", "gcode"],
        ["openai:gpt-5", "google:gemini", "local:qwen"],
        ["web_search", "read_url", "recall", "calculate"],
        "Olcu, tolerans, malzeme ve baski ayarlarini netlestir.",
    ),
    SpecialistProfile(
        "codebase_agent",
        "Kod Tabani Ajani",
        ["github", "repo", "commit", "push", "pull request", "test", "hata", "bug", "kod", "dosya"],
        ["openai:gpt-5", "anthropic:claude", "local:qwen-coder"],
        ["recall", "run_python", "web_search", "read_url"],
        "Planla, dosyalari tara, dar kapsamli duzelt, test et ve raporla.",
    ),
    SpecialistProfile(
        "general",
        "Genel Asistan",
        [],
        ["local:qwen", "openai:gpt-5", "openai:gpt-4.1"],
        ["recall", "current_time", "web_search"],
        "Turkce, baglama duyarli ve onceki konusmayi dikkate alan cevap ver.",
    ),
]


DEFAULT_TOOL_POLICY = ToolPolicy(
    safe_tools=[
        "web_search",
        "read_url",
        "recall",
        "remember",
        "calculate",
        "current_time",
        "weather",
        "analyze_image",
        "extract_text_image",
        "run_python",
    ],
    approval_required_tools=[
        "terminal",
        "github_push",
        "github_release",
        "database_write",
        "file_delete",
        "package_install",
        "server_restart",
    ],
    blocked_prompt_sources=[
        ".env",
        "config.toml:auth.token",
        "codegaai_config.json:secrets",
        "private_key",
    ],
    secret_patterns=[
        r"ghp_[A-Za-z0-9_]{20,}",
        r"github_pat_[A-Za-z0-9_]{20,}",
        r"hf_[A-Za-z0-9_]{20,}",
        r"sk-ant-[A-Za-z0-9_-]{20,}",
        r"sk-[A-Za-z0-9_-]{20,}",
        r"AIza[0-9A-Za-z_-]{20,}",
        r"(?i)(api[_-]?key|token|password|secret)\s*[:=]\s*['\"]?[^'\"\s]+",
    ],
)


def redact_secrets(text: str, policy: ToolPolicy = DEFAULT_TOOL_POLICY) -> tuple[str, list[str]]:
    """Mask tokens and credentials before prompts are routed to any model."""
    notes: list[str] = []
    redacted = text or ""
    for pattern in policy.secret_patterns:
        new_value, count = re.subn(pattern, "[REDACTED_SECRET]", redacted)
        if count:
            notes.append("Gizli anahtar/token prompttan maskelendi.")
        redacted = new_value
    return redacted, sorted(set(notes))


def _fold(text: str) -> str:
    table = str.maketrans({
        "İ": "i", "I": "i", "ı": "i", "Ğ": "g", "ğ": "g",
        "Ü": "u", "ü": "u", "Ş": "s", "ş": "s", "Ö": "o",
        "ö": "o", "Ç": "c", "ç": "c",
    })
    return (text or "").translate(table).lower()


def select_specialist(message: str) -> SpecialistProfile:
    folded = _fold(message)
    best = SPECIALISTS[-1]
    best_score = -1
    for profile in SPECIALISTS:
        score = sum(1 for trigger in profile.triggers if _fold(trigger) in folded)
        if score > best_score:
            best = profile
            best_score = score
    return best


def _memory_sources_for(intent: str, specialist: SpecialistProfile) -> list[str]:
    sources = ["working_chat", "rag_archive", "core_profile"]
    if specialist.id != "general":
        sources.append(f"specialist:{specialist.id}")
    if intent in {"coding", "vision"}:
        sources.append("recent_errors")
    return sources


def _tools_for(intent: str, specialist: SpecialistProfile) -> list[str]:
    tools = list(dict.fromkeys(["recall", *specialist.tools]))
    if intent == "calculation":
        tools.append("calculate")
    if intent == "vision":
        tools.extend(["analyze_image", "extract_text_image"])
    if intent == "coding":
        tools.extend(["run_python", "web_search"])
    return sorted(set(tools))


def _execution_plan(intent: str, specialist: SpecialistProfile) -> list[str]:
    steps = [
        "Kullanici istegini ve yakin sohbet gecmisini oku.",
        "Ilgili RAG/hafiza kayitlarini getir.",
    ]
    if specialist.id != "general":
        steps.append(f"{specialist.label} profilinin kontrol listesini uygula.")
    if intent == "coding":
        steps.extend(["Kod tabanini/dosyalari tara.", "Duzeltme yapmadan once etki alanini daralt.", "Test veya statik kontrol calistir."])
    elif intent == "vision":
        steps.extend(["Ekli gorseli modele/OCR'a aktar.", "Gorsel bulgulari metin cevabina bagla."])
    elif intent == "calculation":
        steps.append("Hesaplamayi aracla dogrula.")
    steps.append("Sonucu Turkce, net ve baglama sadik sekilde raporla.")
    return steps


def plan_agent_task(
    message: str,
    history: list[dict[str, Any]] | None = None,
    available_models: list[str] | None = None,
) -> AgentBlueprint:
    """Return the model/tool/memory plan for an incoming user task."""
    history_text = " ".join(str(m.get("content", "")) for m in (history or [])[-6:])
    combined = f"{history_text}\n{message}".strip()
    redacted, security_notes = redact_secrets(combined)
    decision = decide_response(message)
    specialist = select_specialist(combined)

    provider_chain = list(specialist.preferred_models)
    if decision.intent == "vision":
        provider_chain = ["openai:gpt-5", "google:gemini", "local:vision", *provider_chain]
    elif decision.intent == "coding":
        provider_chain = ["openai:gpt-5", "anthropic:claude", "local:qwen-coder", *provider_chain]
    elif len(combined) > 20_000:
        provider_chain = ["openai:gpt-4.1", "google:gemini", *provider_chain]

    if available_models:
        available = set(available_models)
        provider_chain = [p for p in provider_chain if p in available or p.startswith("local:")]

    provider_chain = list(dict.fromkeys(provider_chain))
    tools = _tools_for(decision.intent, specialist)
    approval_required = [
        tool for tool in DEFAULT_TOOL_POLICY.approval_required_tools
        if tool in {"terminal", "github_push", "database_write"}
        and specialist.id in {"codebase_agent", "php_directadmin", "docker_ubuntu", "crypto_security"}
    ]

    return AgentBlueprint(
        intent=decision.intent,
        specialist=specialist.id,
        provider_chain=provider_chain,
        tools=tools,
        memory_sources=_memory_sources_for(decision.intent, specialist),
        approval_required=approval_required,
        security_notes=security_notes,
        redacted_prompt=redacted,
        execution_plan=_execution_plan(decision.intent, specialist),
    )


def platform_status() -> dict[str, Any]:
    """Return platform capabilities for UI/API diagnostics."""
    return {
        "providers": [asdict(p) | {"configured": p.configured} for p in PROVIDERS],
        "specialists": [asdict(s) for s in SPECIALISTS],
        "tool_policy": asdict(DEFAULT_TOOL_POLICY),
        "principle": "CODEGA AI = multi-model agent platform + RAG + tools + safety, not a single from-scratch model.",
    }
