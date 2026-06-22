"""
Fast deterministic answers and lightweight task classification.

This module sits before the agent/model pipeline. Its job is intentionally
small: if the user asks for a direct, short, or obvious answer, do not route
through planner, RAG, verifier, or a heavy model.
"""

from __future__ import annotations

import ast
import operator
import re
import unicodedata
from typing import Optional


FAST_RESPONSE = "FAST_RESPONSE"
DIRECT_INSTRUCTION = "DIRECT_INSTRUCTION"
SHORT_QA = "SHORT_QA"
CHAT = "CHAT"
CODING = "CODING"
ANALYSIS = "ANALYSIS"
RESEARCH = "RESEARCH"
AGENT_TASK = "AGENT_TASK"
ARCHITECTURE = "ARCHITECTURE"
DEBUGGING = "DEBUGGING"

_DIRECT_SKIP_WORDS = {
    "sonuc",
    "sonucu",
    "cevap",
    "cevabi",
    "yanit",
    "yaniti",
    "cikti",
}

_SAFE_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def fold_tr(text: str) -> str:
    """ASCII-ish Turkish fold for intent checks."""
    value = unicodedata.normalize("NFKD", str(text or ""))
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    table = str.maketrans({
        "ı": "i", "İ": "i", "ğ": "g", "Ğ": "g", "ü": "u", "Ü": "u",
        "ş": "s", "Ş": "s", "ö": "o", "Ö": "o", "ç": "c", "Ç": "c",
    })
    return value.translate(table).lower()


def classify_task(message: str) -> str:
    text = str(message or "").strip()
    low = fold_tr(text)
    words = re.findall(r"[\w']+", low)

    coding_action_markers = [
        "kod yaz", "kodla", "kodunu calistir", "calistir ve", "migration olustur",
        "api yaz", "endpoint", "controller", "service", "repository", "flutter",
        "laravel projesi", "php laravel", "dockerfile", "sql sorgu",
    ]

    if any(k in low for k in coding_action_markers) or "```" in text:
        return CODING

    if _direct_output_answer(text) is not None:
        return DIRECT_INSTRUCTION

    if _simple_math_answer(text) is not None:
        return FAST_RESPONSE

    if re.match(r"^(merhaba|selam|hey|hi|hello|gunaydin|iyi aksamlar|iyi geceler)\b", low):
        return CHAT
    if re.match(r"^(ok|tamam|evet|hayir|olur|peki)\b", low) and len(words) <= 4:
        return FAST_RESPONSE

    if any(k in low for k in ["hata", "bug", "traceback", "exception", "timeout", "calismiyor", "bozuk"]):
        return DEBUGGING

    architecture_markers = [
        "mimari", "architecture", "database design", "domain model",
        "deployment plan", "testing plan", "clean architecture", "sistem tasarla",
    ]
    if any(k in low for k in architecture_markers):
        return ARCHITECTURE

    research_markers = ["internette ara", "webde ara", "guncel", "son haber", "latest", "research", "github incele"]
    if any(k in low for k in research_markers):
        return RESEARCH

    short_qa_markers = [
        " nedir", " ne demek", " kimdir", " baskenti", " kac eder",
        "hangi sehir", "hangi ulke", "tek cumle",
    ]
    if len(words) <= 14 and any(k in low for k in short_qa_markers):
        return SHORT_QA

    if any(k in low for k in ["analiz et", "karsilastir", "incele", "raporla"]):
        return ANALYSIS

    if any(k in low for k in ["dosya olustur", "github", "push", "release", "deploy", "terminal"]):
        return AGENT_TASK

    return ""


def bypass_heavy_pipeline(task_class: str) -> bool:
    return task_class in {FAST_RESPONSE, DIRECT_INSTRUCTION, SHORT_QA, CHAT}


def fast_answer_for(message: str) -> Optional[str]:
    text = str(message or "").strip()
    low = fold_tr(text)

    direct = _direct_output_answer(text)
    if direct is not None:
        return direct

    math_answer = _simple_math_answer(text)
    if math_answer is not None:
        return math_answer

    if re.match(r"^(ok|tamam)\s*(yaz|de|cevapla)?\.?$", low):
        return "OK" if low.startswith("ok") else "Tamam"

    if re.match(r"^(merhaba|selam|hey|hi|hello)\b", low):
        return "Merhaba, nasıl yardımcı olabilirim?"
    if re.match(r"^gunaydin\b", low):
        return "Gunaydin."
    if re.match(r"^iyi aksamlar\b", low):
        return "Iyi aksamlar."
    if re.match(r"^iyi geceler\b", low):
        return "Iyi geceler."

    if re.search(r"\bphp\s+(nedir|ne demek)\b", low):
        return "PHP, web geliştirme için yaygın kullanılan sunucu taraflı bir programlama dilidir."
    if re.search(r"\blaravel\s+(nedir|ne demek)\b", low):
        return "Laravel, PHP ile web uygulamaları geliştirmek için kullanılan modern bir framework'tür."
    if "turkiye" in low and "baskent" in low:
        return "Ankara"

    return None


def _direct_output_answer(message: str) -> Optional[str]:
    text = str(message or "").strip()
    low = fold_tr(text)

    if not (
        "sadece" in low
        or "yalnizca" in low
        or "baska hicbir sey yazma" in low
        or re.search(r"\b(yaz|de|cevapla)\.?$", low)
    ):
        return None

    match = re.search(
        r"(?:sadece|yalnizca|yalnızca)?\s*([A-Za-z0-9İıĞğÜüŞşÖöÇç_./#+\- ]{1,80}?)\s+"
        r"(?:yaz|de|cevapla)\b",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None

    value = match.group(1).strip(" .,!?:;\"'")
    if not value:
        return None
    if fold_tr(value) in _DIRECT_SKIP_WORDS:
        return None
    # "2 + 2 kac eder? Sadece sonucu yaz" must go through math, not return "sonucu".
    if any(ch.isdigit() for ch in text) and re.search(r"\b(kac|kaç|hesapla|eder)\b", low):
        return None
    return value


def _simple_math_answer(message: str) -> Optional[str]:
    text = str(message or "")
    normalized = text.replace("×", "*").replace("÷", "/").replace("^", "**")
    match = re.search(r"(-?\d+(?:\.\d+)?(?:\s*[\+\-\*/%]\s*-?\d+(?:\.\d+)?)+)", normalized)
    if not match:
        return None
    expr = match.group(1)
    try:
        value = _eval_math(expr)
    except Exception:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value)


def _eval_math(expr: str) -> float | int:
    node = ast.parse(expr, mode="eval")
    return _eval_node(node.body)


def _eval_node(node: ast.AST) -> float | int:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _SAFE_OPS:
        return _SAFE_OPS[type(node.op)](_eval_node(node.left), _eval_node(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _SAFE_OPS:
        return _SAFE_OPS[type(node.op)](_eval_node(node.operand))
    raise ValueError("unsafe expression")
