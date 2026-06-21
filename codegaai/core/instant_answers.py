"""
codegaai.core.instant_answers
=============================

Deterministic pre-model answers for tiny tasks.

Local models are useful for reasoning, but they should never spend minutes on
arithmetic, one-word control prompts, or very small factual questions. This
module keeps the chat pipeline responsive by answering safe micro-tasks before
model generation.
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

_ACKS = {"tamam", "ok", "peki", "olur", "anladim", "anladim"}
_GREETINGS = {
    "merhaba": "Merhaba. Buradayim, nasil yardimci olayim?",
    "selam": "Selam. Buradayim, nasil yardimci olayim?",
    "gunaydin": "Gunaydin. Buradayim, nasil yardimci olayim?",
    "iyi aksamlar": "Iyi aksamlar. Buradayim, nasil yardimci olayim?",
    "iyi geceler": "Iyi geceler. Buradayim, nasil yardimci olayim?",
}
_THANKS = {"tesekkur", "tesekkurler", "sagol", "eyvallah"}

_DIRECT_OUTPUT_RE = re.compile(
    r"(?:^|\b)(?:sadece|yalnizca|only)\s+"
    r"[\"']?(?P<value>[^\"'\r\n]{1,40}?)[\"']?\s+"
    r"(?:yaz|soyle|cevapla|write|say|reply)\b",
    re.IGNORECASE,
)
_DIRECT_OUTPUT_PLACEHOLDERS = {
    "cevap",
    "cevabi",
    "sonuc",
    "sonucu",
    "yanit",
}


@dataclass(frozen=True)
class InstantAnswer:
    content: str
    intent: str = "instant"


def _fold_tr(text: str) -> str:
    table = str.maketrans({
        "İ": "i", "I": "i", "ı": "i", "ğ": "g", "Ğ": "g",
        "ü": "u", "Ü": "u", "ş": "s", "Ş": "s",
        "ö": "o", "Ö": "o", "ç": "c", "Ç": "c",
    })
    return str(text or "").translate(table).casefold().replace("i\u0307", "i")


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

    folded = _fold_tr(text)
    compact = re.sub(r"\s+", " ", folded).strip(" .!?")

    match = _MATH_EXPR_RE.search(text)
    stripped_math = bool(match and match.group("expr").strip() == text.rstrip(" ?"))
    if match and (
        stripped_math
        or re.search(r"(kac|kaç|eder|sonuc|sonuç|hesapla|=|\?)", text, re.IGNORECASE)
    ):
        result = calculate_expression(match.group("expr"))
        if result is not None:
            only_result = re.search(
                r"(sadece|yalnizca|yalnızca).{0,20}(sonuc|sonuç|cevap)",
                text,
                re.IGNORECASE,
            )
            return InstantAnswer(result if only_result else f"Sonuc: {result}", intent="calculation")

    direct = _DIRECT_OUTPUT_RE.search(folded)
    if direct:
        value = re.sub(r"\s+", " ", direct.group("value")).strip(" .")
        original_match = _DIRECT_OUTPUT_RE.search(text)
        original_value = original_match.group("value").strip(" .") if original_match else value
        if value and value.casefold() not in _DIRECT_OUTPUT_PLACEHOLDERS:
            return InstantAnswer(original_value, intent="direct_output")

    if compact in _ACKS:
        return InstantAnswer("Tamam.", intent="ack")
    if compact in _GREETINGS:
        return InstantAnswer(_GREETINGS[compact], intent="social")
    if compact in _THANKS:
        return InstantAnswer("Rica ederim. Buradayim, devam edebiliriz.", intent="social")

    if re.search(r"\bphp\s+(nedir|ne demek)\b", folded, re.IGNORECASE):
        return InstantAnswer(
            "PHP, dinamik web uygulamalari ve API'ler gelistirmek icin kullanilan sunucu tarafli bir programlama dilidir.",
            intent="short_qa",
        )

    if re.search(r"\blaravel\s+(nedir|ne demek)\b", folded, re.IGNORECASE):
        return InstantAnswer(
            "Laravel, PHP ile modern web uygulamalari ve REST API'ler gelistirmek icin kullanilan bir framework'tur.",
            intent="short_qa",
        )

    if re.search(r"(turkiye).{0,40}(baskenti)", folded, re.IGNORECASE):
        return InstantAnswer("Ankara", intent="short_qa")

    return None
