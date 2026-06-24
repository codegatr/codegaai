"""
codegaai.core.model_router
============================

Akilli model yonlendirici.

Kullanici model secmez; CODEGA AI talimatin niyetine, indirilen modellere
ve cihaz bellegine gore en uygun modeli tercih eder.
"""

from __future__ import annotations

import re
import threading
from dataclasses import dataclass
from typing import Optional

from codegaai.utils.logger import get_logger

log = get_logger(__name__)


@dataclass
class ModelRule:
    """Bir model icin routing kurali."""
    model_id: str
    priority: int
    min_vram_gb: float
    keywords: list[str]
    patterns: list[str]
    task_types: list[str]


PHP_PATTERNS = [
    r"\bphp\b", r"<\?php", r"\blaravel\b", r"\bwordpress\b",
    r"\bsymfony\b", r"\byii\b", r"\bcodeigniter\b",
    r"\bpdo\b", r"\bmysqli\b", r"\bcomposer\b",
    r"\b\.php\b", r"\bnamespace\b", r"\becho\s+",
    r"\$_GET\b", r"\$_POST\b", r"\bdirectadmin\b",
    r"\bcpanel\b", r"\bnginx\b", r"\bhtaccess\b", r"\.htaccess",
]

CODE_PATTERNS = [
    r"```\w+", r"\bfunction\b", r"\bclass\b", r"\bimport\b",
    r"\bdef\b.*:", r"\bconst\b.*=", r"\blet\b.*=",
    r"\bdebug\b", r"\bhata\b.*kod", r"\bkod.*hata\b",
    r"\bcss\b", r"\bhtml\b", r"\bjavascript\b", r"\btypescript\b",
    r"\bpython\b", r"\bapi\b.*endpoint", r"\bsql\b",
    r"\bjson\b", r"\bxml\b", r"\bregex\b",
]

TURKISH_HEAVY = [
    r"\bturkce\b", r"\btürkçe\b", r"\bturkiye\b", r"\bTürkiye\b",
    r"\bnasil.*soylenir\b", r"\bnasıl.*söylenir\b",
    r"\banlami.*nedir\b", r"\banlamı.*nedir\b",
    r"\bcevir\b.*turkce", r"\bçevir\b.*türkçe",
]

QUICK_PATTERNS = [
    # Short factual questions must use the light model before code rules run.
    r"\b(nedir|ne demek)\b.{0,80}\b(tek cümle|tek cumle|kısa|kisa|açıkla|acikla)\b",
    r"\b(php|laravel|mysql|ubuntu|docker)\b.{0,40}\b(nedir|ne demek)\b",
    r"\b(türkiye|turkiye).{0,40}\bbaşkenti|\bbaskenti\b",
    r"\b(sadece|yalnızca|yalnizca|only)\b.{0,30}\b(yaz|söyle|soyle|cevapla|write|say|reply)\b",
    r"\b(sadece|yalnızca|yalnizca)\b.{0,30}\b(komutu|komut|sorguyu|sorgu|sonucu|sonuç|cevabı|cevap)\b",
    r"^\s*\d+\s*[\+\-\*/xX]\s*\d+",
    r"^(merhaba|selam|hey|hi|hello)\b",
    r"^nasılsın", r"^ne haber", r"^iyi misin",
    r"^teşekkür", r"^tamam\b", r"^anladım",
    r"^evet\b", r"^hayır\b", r"^ok\b",
]

RULES: list[ModelRule] = [
    ModelRule(
        model_id="qwen3-coder-30b-a3b-q4_k_m",
        priority=120,
        min_vram_gb=16.0,
        keywords=["buyuk repo", "büyük repo", "large repo", "refactor",
                  "migration", "agent", "kod ajani", "kod ajanı",
                  "code agent", "typescript", "python", "php", "laravel",
                  "debug", "test yaz", "program yaz", "uygulama geliştir"],
        patterns=PHP_PATTERNS + CODE_PATTERNS,
        task_types=["code"],
    ),
    ModelRule(
        model_id="qwen3-8b-q4_k_m",
        priority=100,
        min_vram_gb=10.0,
        keywords=["php", "laravel", "wordpress", "mysql", "nginx",
                  "apache", "cpanel", "directadmin", "htaccess",
                  "javascript", "typescript", "css", "html", "react",
                  "vue", "node", "npm", "api", "endpoint", "sql",
                  "veritabani", "veritabanı", "database", "sorgu",
                  "query", "kod", "code", "debug", "hata", "error",
                  "bug", "class", "function", "method", "interface",
                  "composer", "pdo", "mysqli", "eloquent", "git",
                  "github", "deploy", "migration", "json", "xml",
                  "regex", "curl", "http", "codega", "erp", "cms",
                  "cron", "ajax"],
        patterns=PHP_PATTERNS + CODE_PATTERNS,
        task_types=["code"],
    ),
    ModelRule(
        model_id="qwen3-4b-q4_k_m",
        priority=110,
        min_vram_gb=2.5,
        keywords=[],
        patterns=QUICK_PATTERNS,
        task_types=["factual"],
    ),
    ModelRule(
        model_id="aya-expanse-8b-q4_k_m",
        priority=70,
        min_vram_gb=6.2,
        keywords=["turkce", "türkçe", "turk", "türk", "anadolu",
                  "cevir", "çevir", "translate", "dil", "gramer",
                  "yazim", "yazım", "imla", "kelime", "anlam"],
        patterns=TURKISH_HEAVY,
        task_types=["creative"],
    ),
    ModelRule(
        model_id="llama-3.1-8b-instruct-q4_k_m",
        priority=60,
        min_vram_gb=6.0,
        keywords=["uzun", "detayli", "detaylı", "kapsamli", "kapsamlı",
                  "analiz", "rapor", "arastirma", "araştırma",
                  "research", "long context", "summarize", "ozetle", "özetle"],
        patterns=[],
        task_types=["long_context", "reasoning"],
    ),
    ModelRule(
        model_id="qwen3-8b-q4_k_m",
        priority=50,
        min_vram_gb=10.0,
        keywords=[],
        patterns=[],
        task_types=["reasoning", "general"],
    ),
]


class ModelRouter:
    """Sorguya gore model secer. Singleton."""

    _instance: Optional["ModelRouter"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._enabled = True
        self._last_model: Optional[str] = None

    @classmethod
    def get(cls) -> "ModelRouter":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def select_model(
        self,
        query: str,
        history: list[dict] = None,
        force_model_id: Optional[str] = None,
    ) -> Optional[str]:
        """
        Sorgu icin en uygun model ID'sini dondur.
        None mevcut hazir modeli koru anlamina gelir.
        """
        if force_model_id:
            return force_model_id
        if not self._enabled:
            return None

        from codegaai.core.engine import LLMEngine
        from codegaai.core.models_registry import ModelRegistry

        reg = ModelRegistry.get()
        engine = LLMEngine.get()
        current = engine._status.model_id if engine.is_ready else None
        available_vram = self._get_free_vram()

        text_for_analysis = self._normalize_text(query or "")
        if history:
            recent = " ".join(
                m.get("content", "")[:200] for m in history[-3:]
            )
            recent = self._normalize_text(recent)
            text_for_analysis = f"{recent} {text_for_analysis}"

        quick_model = self._select_quick_model(text_for_analysis)
        if quick_model and quick_model != current:
            log.info("Model router fast path: '%s...' -> %s", query[:40], quick_model)
            return quick_model

        best_model = None
        best_priority = -1
        for rule in RULES:
            if not reg.is_llm_downloaded(rule.model_id):
                continue
            if available_vram and available_vram < rule.min_vram_gb:
                continue
            score = self._score_rule(text_for_analysis, rule)
            if score > 0 and rule.priority > best_priority:
                best_model = rule.model_id
                best_priority = rule.priority

        if best_model and best_model != current:
            log.info("Model router: '%s...' -> %s (skor %d)",
                     query[:40], best_model, best_priority)
            return best_model
        return None

    def _normalize_text(self, text: str) -> str:
        table = str.maketrans({
            "İ": "i", "I": "i", "ı": "i", "ğ": "g", "Ğ": "g",
            "ü": "u", "Ü": "u", "ş": "s", "Ş": "s",
            "ö": "o", "Ö": "o", "ç": "c", "Ç": "c",
        })
        return str(text or "").translate(table).casefold().replace("i\u0307", "i")

    def _score_rule(self, text: str, rule: ModelRule) -> int:
        score = 0
        for kw in rule.keywords:
            if kw in text:
                score += 2
        for pattern in rule.patterns:
            if re.search(pattern, text, re.IGNORECASE):
                score += 3
        return score

    def _select_quick_model(self, text: str) -> Optional[str]:
        normalized = self._normalize_text(text)
        if not any(re.search(pattern, normalized, re.IGNORECASE) for pattern in QUICK_PATTERNS):
            return None
        from codegaai.core.models_registry import ModelRegistry

        reg = ModelRegistry.get()
        for model_id in ("qwen3-4b-q4_k_m", "qwen2.5-3b-instruct-q4_k_m"):
            if reg.is_llm_downloaded(model_id):
                return model_id
        return None

    def _get_free_vram(self) -> Optional[float]:
        try:
            import torch
            if not torch.cuda.is_available():
                return None
            props = torch.cuda.get_device_properties(0)
            free = props.total_memory - torch.cuda.memory_allocated(0)
            return free / 1e9
        except Exception:
            return None

    def switch_model_if_needed(self, model_id: str) -> bool:
        from codegaai.core.engine import LLMEngine
        engine = LLMEngine.get()

        if engine.is_ready and engine._status.model_id == model_id:
            return True
        if engine._status.state == "loading":
            log.debug("Model yukleme devam ediyor, gecis atlandi")
            return False
        try:
            log.info("Otomatik model gecisi: %s -> %s",
                     engine._status.model_id or "yok", model_id)
            engine.load(model_id)
            return True
        except Exception as exc:
            log.warning("Model gecisi basarisiz: %s", exc)
            return False

    def enable(self) -> None:
        self._enabled = True

    def disable(self) -> None:
        self._enabled = False

    @property
    def is_enabled(self) -> bool:
        return self._enabled
