"""
codegaai.core.model_router
============================

Akıllı Model Yönlendirici.

Claude'un en önemli avantajlarından biri: görev tipine göre
doğru model kullanması. CODEGA AI de aynısını yapıyor.

Routing mantığı:
  PHP/Web kodu → Qwen Coder 7B (kod için özel eğitilmiş)
  Hızlı sohbet → Qwen 3B (VRAM tasarrufu, hız)
  Türkçe ağır  → Aya Expanse 8B (çok dilli uzman)
  Genel zor    → Qwen 7B (varsayılan, dengeli)
  Vision+metin → Qwen 7B (multimodal context)
  Matematik    → Qwen 7B veya Coder

Her karar:
  1. Sorguyu analiz et (keyword + complexity)
  2. Mevcut indirilmiş modelleri kontrol et
  3. VRAM yeterliliğini kontrol et
  4. Optimum modeli seç
  5. Gerekirse önceki modeli unload et, yenisini yükle

Config ile devre dışı bırakılabilir (auto_model_routing: false).
"""

from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass
from typing import Optional

from codegaai.utils.logger import get_logger

log = get_logger(__name__)


# ============================================================
# Kural Tanımları
# ============================================================

@dataclass
class ModelRule:
    """Bir model için routing kuralı."""
    model_id: str
    priority: int          # Yüksek = önce dene
    min_vram_gb: float
    keywords: list[str]    # Trigger kelimeler
    patterns: list[str]    # Regex patternler
    task_types: list[str]  # reasoning/code/factual/creative


# PHP/Web geliştirme tespiti
PHP_PATTERNS = [
    r"\bphp\b", r"<\?php", r"\blaravel\b", r"\bwordpress\b",
    r"\bsymfony\b", r"\byii\b", r"\bcodeigniter\b",
    r"\bpdo\b", r"\bmysqli\b", r"\bcomposer\b",
    r"\b\.php\b", r"\bnamespace\b.*\\\b",
    r"\becho\s+[\"']", r"\b\$_GET\b", r"\b\$_POST\b",
    r"\bdirectadmin\b", r"\bcpanel\b", r"\bnginx\b.*\.conf",
    r"\bhtaccess\b", r"\.htaccess",
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
    r"\btürkçe\b", r"\bturkce\b", r"\bTürkiye\b",
    r"\bnasıl.*söylenir\b", r"\banlamı.*nedir\b",
    r"\bçevir\b.*türkçe", r"\btürkçe.*yaz",
]

QUICK_PATTERNS = [
    r"^(merhaba|selam|hey|hi|hello)\b",
    r"^nasılsın", r"^ne haber", r"^iyi misin",
    r"^teşekkür", r"^tamam\b", r"^anladım",
    r"^evet\b", r"^hayır\b", r"^ok\b",
]

RULES: list[ModelRule] = [
    # PHP/Web/Kod → Coder 7B (en yüksek öncelik)
    ModelRule(
        model_id="qwen2.5-coder-7b-instruct-q4_k_m",
        priority=100,
        min_vram_gb=5.5,
        keywords=["php", "laravel", "wordpress", "mysql", "nginx",
                  "apache", "cpanel", "directadmin", "htaccess",
                  "javascript", "typescript", "css", "html",
                  "react", "vue", "node", "npm", "api", "endpoint",
                  "sql", "veritabanı", "database", "sorgu", "query",
                  "kod", "code", "debug", "hata", "error", "bug",
                  "class", "function", "method", "interface",
                  "composer", "pdo", "mysqli", "eloquent",
                  "git", "github", "deploy", "migration",
                  "json", "xml", "regex", "curl", "http",
                  "codega", "erp", "cms", "cron", "ajax"],
        patterns=PHP_PATTERNS + CODE_PATTERNS,
        task_types=["code"],
    ),
    # Kısa/hızlı sohbet → Qwen 3B (az VRAM, hızlı)
    ModelRule(
        model_id="qwen2.5-3b-instruct-q4_k_m",
        priority=90,
        min_vram_gb=2.5,
        keywords=[],
        patterns=QUICK_PATTERNS,
        task_types=["factual"],
    ),
    # Türkçe ağır içerik → Aya 8B
    ModelRule(
        model_id="aya-expanse-8b-q4_k_m",
        priority=70,
        min_vram_gb=6.2,
        keywords=["türkçe", "turkce", "türk", "anadolu",
                  "çevir", "translate", "dil", "gramer",
                  "yazım", "imla", "kelime", "anlam"],
        patterns=TURKISH_HEAVY,
        task_types=["creative"],
    ),
    # Genel/zor → Qwen 7B (varsayılan fallback)
    ModelRule(
        model_id="qwen2.5-7b-instruct-q4_k_m",
        priority=50,
        min_vram_gb=5.5,
        keywords=[],
        patterns=[],
        task_types=["reasoning", "general"],
    ),
    # Uzun bağlam / Karmaşık akıl yürütme → Llama 3.1 8B
    ModelRule(
        model_id="llama-3.1-8b-instruct-q4_k_m",
        priority=60,
        min_vram_gb=6.0,
        keywords=["uzun", "detaylı", "kapsamlı", "analiz",
                  "rapor", "araştırma", "research", "long context",
                  "summarize", "özetle"],
        patterns=[],
        task_types=["long_context", "reasoning"],
    ),
]


# ============================================================
# Router
# ============================================================

class ModelRouter:
    """Sorguya göre model seçer. Singleton."""

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
        Sorgu için en uygun model ID'sini döndür.
        None → mevcut yüklü modeli kullan.
        """
        if force_model_id:
            return force_model_id

        if not self._enabled:
            return None

        from codegaai.core.models_registry import ModelRegistry
        from codegaai.core.engine import LLMEngine

        reg = ModelRegistry.get()
        engine = LLMEngine.get()
        current = engine._status.model_id if engine.is_ready else None

        # Mevcut VRAM bilgisi
        available_vram = self._get_free_vram()

        # Sorgu analizi
        q = query.lower()
        text_for_analysis = q
        if history:
            # Son 3 mesajı da analiz et
            recent = " ".join(
                m.get("content", "")[:200] for m in history[-3:]
            ).lower()
            text_for_analysis = f"{recent} {q}"

        # Her kuralı değerlendir
        best_model = None
        best_priority = -1

        for rule in RULES:
            if not reg.is_llm_downloaded(rule.model_id):
                continue  # İndirilmemiş

            if available_vram and available_vram < rule.min_vram_gb:
                continue  # VRAM yetersiz

            score = self._score_rule(text_for_analysis, rule)
            if score > 0 and rule.priority > best_priority:
                best_model = rule.model_id
                best_priority = rule.priority

        if best_model and best_model != current:
            log.info("Model router: '%s...' → %s (skor %d)",
                     query[:40], best_model, best_priority)
            return best_model

        return None  # Mevcut modeli koru

    def _score_rule(self, text: str, rule: ModelRule) -> int:
        """Kural için skor hesapla."""
        score = 0

        # Keyword eşleşmesi
        for kw in rule.keywords:
            if kw in text:
                score += 2

        # Pattern eşleşmesi
        for p in rule.patterns:
            if re.search(p, text, re.IGNORECASE):
                score += 3

        return score

    def _get_free_vram(self) -> Optional[float]:
        """Boş GPU belleği (GB)."""
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
        """
        Hedef model yüklü değilse geçiş yap.
        Dönüş: True = geçiş yapıldı / zaten doğru
        """
        from codegaai.core.engine import LLMEngine
        engine = LLMEngine.get()

        if engine.is_ready and engine._status.model_id == model_id:
            return True

        if engine._status.state == "loading":
            log.debug("Model yükleme devam ediyor, geçiş atlandı")
            return False

        try:
            log.info("Otomatik model geçişi: %s → %s",
                     engine._status.model_id or "yok", model_id)
            engine.load(model_id)
            return True
        except Exception as exc:
            log.warning("Model geçişi başarısız: %s", exc)
            return False

    def enable(self) -> None:
        self._enabled = True

    def disable(self) -> None:
        self._enabled = False

    @property
    def is_enabled(self) -> bool:
        return self._enabled
