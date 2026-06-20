"""
codegaai.core.instant_answers
=============================

Deterministic pre-model answers for tiny tasks.

Local models are useful for reasoning, but they should never be asked to spend
minutes on arithmetic, time, or one-word control prompts. This module keeps the
chat pipeline responsive by answering safe micro-tasks before model generation.
"""

from __future__ import annotations

import ast
import operator
import re
from dataclasses import dataclass


_MATH_EXPR_RE = re.compile(
    r"(?P<expr>(?:\(?\s*-?\d+(?:[.,]\d+)?\s*\)?\s*"
    r"(?:[+\-*/xX\u00d7\u00f7]\s*\(?\s*-?\d+(?:[.,]\d+)?\s*\)?\s*)+))"
)

_ALLOWED_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
}

_ALLOWED_UNARY = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}

_ACKS = {"tamam", "ok", "peki", "olur", "anladim", "anladım"}
_GREETINGS = {
    "merhaba": "Merhaba. Buradayim, nasil yardimci olayim?",
    "selam": "Selam. Buradayim, nasil yardimci olayim?",
    "gunaydin": "Gunaydin. Buradayim, nasil yardimci olayim?",
    "günaydın": "Gunaydin. Buradayim, nasil yardimci olayim?",
    "iyi aksamlar": "Iyi aksamlar. Buradayim, nasil yardimci olayim?",
    "iyi akşamlar": "Iyi aksamlar. Buradayim, nasil yardimci olayim?",
    "iyi geceler": "Iyi geceler. Buradayim, nasil yardimci olayim?",
}
_THANKS = {"tesekkur", "tesekkurler", "teşekkür", "teşekkürler", "sagol", "sağol", "eyvallah"}


_DIRECT_OUTPUT_RE = re.compile(
    r"(?:^|\b)(?:sadece|yaln[ıi]zca|yalnizca|only)\s+"
    r"[\"'“”‘’]?(?P<value>[A-Za-z0-9_.!? -]{1,40}?)[\"'“”‘’]?\s+"
    r"(?:yaz|soyle|söyle|cevapla|write|say|reply)\b",
    re.IGNORECASE,
)
_DIRECT_OUTPUT_PLACEHOLDERS = {
    "cevap",
    "cevabi",
    "cevabı",
    "sonuc",
    "sonuç",
    "sonucu",
    "yanit",
    "yanıt",
}


@dataclass(frozen=True)
class InstantAnswer:
    content: str
    intent: str = "instant"


def _eval_node(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _eval_node(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    if isinstance(node, ast.BinOp) and type(node.op) in _ALLOWED_BINOPS:
        return _ALLOWED_BINOPS[type(node.op)](_eval_node(node.left), _eval_node(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _ALLOWED_UNARY:
        return _ALLOWED_UNARY[type(node.op)](_eval_node(node.operand))
    raise ValueError("unsupported expression")


def calculate_expression(expr: str) -> str | None:
    """Return a clean arithmetic result, or None when the expression is unsafe."""
    value = str(expr or "").strip().replace(",", ".")
    value = value.replace("x", "*").replace("X", "*").replace("\u00d7", "*").replace("\u00f7", "/")
    if not re.fullmatch(r"[\d\s+\-*/().]+", value):
        return None
    try:
        parsed = ast.parse(value, mode="eval")
        result = _eval_node(parsed)
    except Exception:
        return None
    if result.is_integer():
        return str(int(result))
    return f"{result:.10g}"


def instant_answer_for(message: str) -> InstantAnswer | None:
    """Answer safe micro-tasks without calling the LLM."""
    text = str(message or "").strip()
    if not text:
        return None

    match = _MATH_EXPR_RE.search(text)
    stripped_math = bool(match and match.group("expr").strip() == text.rstrip(" ?"))
    if match and (
        stripped_math
        or re.search(r"(kac|ka\u00e7|eder|sonuc|sonu\u00e7|hesapla|=|\?)", text, re.IGNORECASE)
    ):
        result = calculate_expression(match.group("expr"))
        if result is not None:
            only_result = re.search(
                r"(sadece|yalnizca|yaln\u0131zca).{0,20}(sonuc|sonu\u00e7|cevap)",
                text,
                re.IGNORECASE,
            )
            return InstantAnswer(result if only_result else f"Sonuc: {result}", intent="calculation")

    direct = _DIRECT_OUTPUT_RE.search(text)
    if direct:
        value = re.sub(r"\s+", " ", direct.group("value")).strip(" .")
        if value and value.casefold() not in _DIRECT_OUTPUT_PLACEHOLDERS:
            return InstantAnswer(value, intent="direct_output")

    lowered = text.casefold()
    compact = re.sub(r"\s+", " ", lowered).strip(" .!?")
    if compact in _ACKS:
        return InstantAnswer("Tamam.", intent="ack")
    if compact in _GREETINGS:
        return InstantAnswer(_GREETINGS[compact], intent="social")
    if compact in _THANKS:
        return InstantAnswer("Rica ederim. Buradayim, devam edebiliriz.", intent="social")

    return None
