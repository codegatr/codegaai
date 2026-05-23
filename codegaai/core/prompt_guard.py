"""
codegaai.core.prompt_guard
==========================

Prompt injection and secret redaction helpers for external content.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


INJECTION_PATTERNS = [
    "ignore previous instructions",
    "ignore all previous instructions",
    "reveal your system prompt",
    "print your hidden prompt",
    "developer message",
    "system message",
    "bypass safety",
    "disable guardrails",
]

SECRET_PATTERNS = [
    re.compile(r"ghp_[A-Za-z0-9_]{20,}"),
    re.compile(r"hf_[A-Za-z0-9_]{20,}"),
    re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    re.compile(r"(?i)(?:api[_-]?key|token|secret|password)\s*[:=]?\s*[\"']?[^\"'\s]{8,}"),
]


@dataclass
class PromptGuardResult:
    source: str
    blocked: bool
    risk_score: int
    matched_patterns: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


@dataclass
class RedactionResult:
    text: str
    redactions: list[str] = field(default_factory=list)


def scan_external_text(text: str, source: str = "external") -> PromptGuardResult:
    lowered = text.lower()
    matched = [pattern for pattern in INJECTION_PATTERNS if pattern in lowered]
    score = min(100, len(matched) * 35)
    return PromptGuardResult(
        source=source,
        blocked=score >= 70,
        risk_score=score,
        matched_patterns=matched,
        notes=["External content contains prompt-control language."] if matched else [],
    )


def redact_external_text(text: str) -> RedactionResult:
    redactions: list[str] = []
    redacted = text
    for pattern in SECRET_PATTERNS:
        matches = list(pattern.finditer(redacted))
        redactions.extend(match.group(0)[:32] for match in matches)
        redacted = pattern.sub("[REDACTED_SECRET]", redacted)
    return RedactionResult(text=redacted, redactions=redactions)
