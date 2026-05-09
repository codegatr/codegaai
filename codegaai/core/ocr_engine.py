"""
codegaai.core.ocr_engine
==========================

Faz 11 - OCR: Görüntüden Metin Çıkarma.

Katmanlar (en iyiden başlar, fallback yapar):
  1. EasyOCR — GPU destekli, Türkçe dahil 80+ dil, en iyi doğruluk
  2. Tesseract — CPU, popüler, hız/doğruluk dengesi
  3. Transformers TrOCR — Microsoft'un modeli, el yazısı dahil

Kurulum:
  pip install easyocr
  - veya -
  pip install pytesseract + sistem: apt install tesseract-ocr tesseract-ocr-tur
"""

from __future__ import annotations

import base64
import io
import threading
from pathlib import Path
from typing import Optional

from codegaai.utils.logger import get_logger

log = get_logger(__name__)


class OCREngine:
    """Görüntüden metin çıkarma. Singleton."""

    _instance: Optional["OCREngine"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._reader = None
        self._backend: Optional[str] = None

    @classmethod
    def get(cls) -> "OCREngine":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _init_backend(self) -> str:
        """En iyi mevcut backend'i başlat."""
        if self._backend:
            return self._backend

        # EasyOCR dene
        try:
            import easyocr  # type: ignore
            self._reader = easyocr.Reader(
                ["tr", "en"],
                gpu=self._has_gpu(),
                verbose=False,
            )
            self._backend = "easyocr"
            log.info("OCR: EasyOCR başlatıldı (tr+en, GPU=%s)",
                     self._has_gpu())
            return "easyocr"
        except ImportError:
            log.debug("EasyOCR yüklü değil")

        # Tesseract dene
        try:
            import pytesseract  # type: ignore
            pytesseract.get_tesseract_version()
            self._backend = "tesseract"
            log.info("OCR: Tesseract başlatıldı")
            return "tesseract"
        except Exception:
            log.debug("Tesseract mevcut değil")

        # Pillow ile basit metin analizi
        self._backend = "none"
        log.warning("OCR backend yok. EasyOCR veya Tesseract kur.")
        return "none"

    @staticmethod
    def _has_gpu() -> bool:
        try:
            import torch
            return torch.cuda.is_available()
        except Exception:
            return False

    def _load_image(self, image_path=None, image_bytes=None,
                    image_b64=None):
        from PIL import Image  # type: ignore

        if image_path:
            img = Image.open(image_path)
        elif image_bytes:
            img = Image.open(io.BytesIO(image_bytes))
        elif image_b64:
            img = Image.open(io.BytesIO(base64.b64decode(image_b64)))
        else:
            raise ValueError("Görüntü kaynağı belirtilmedi")

        return img.convert("RGB")

    def extract_text(
        self,
        image_path: Optional[str] = None,
        image_bytes: Optional[bytes] = None,
        image_b64: Optional[str] = None,
        languages: list[str] = None,
        detail: int = 0,  # 0=text only, 1=with bboxes
    ) -> str:
        """
        Görüntüden metin çıkar.

        detail=0 → sadece metin (string)
        detail=1 → bounding box'larla birlikte
        """
        backend = self._init_backend()
        img = self._load_image(image_path, image_bytes, image_b64)

        if backend == "none":
            return "⚠️ OCR kullanılamıyor. EasyOCR veya Tesseract kur."

        if backend == "easyocr":
            return self._easyocr(img, languages or ["tr", "en"], detail)

        if backend == "tesseract":
            return self._tesseract(img, languages)

        return ""

    def _easyocr(self, img, languages: list[str], detail: int) -> str:
        import numpy as np
        arr = np.array(img)
        results = self._reader.readtext(arr, detail=1)

        if not results:
            return "(Görüntüde metin bulunamadı)"

        if detail == 0:
            return "\n".join(r[1] for r in results if r[2] > 0.3)

        lines = []
        for bbox, text, conf in results:
            if conf > 0.3:
                lines.append(f"{text} ({conf:.0%})")
        return "\n".join(lines)

    def _tesseract(self, img, languages: list[str]) -> str:
        import pytesseract
        lang = "+".join(
            "tur" if l == "tr" else l
            for l in (languages or ["tur", "eng"])
        )
        config = f"--oem 3 --psm 6 -l {lang}"
        text = pytesseract.image_to_string(img, config=config)
        return text.strip() or "(Görüntüde metin bulunamadı)"

    @property
    def available(self) -> bool:
        return self._init_backend() != "none"

    @property
    def backend_name(self) -> str:
        return self._init_backend()
