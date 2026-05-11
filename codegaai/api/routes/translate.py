"""
codegaai.api.routes.translate
================================

Faz 28 — Çeviri Sistemi

POST /api/translate/text      — Metin çevir
POST /api/translate/document  — Belge çevir (PDF/TXT)
GET  /api/translate/languages — Desteklenen diller
"""

from __future__ import annotations

from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()

LANGUAGES = {
    "tr": "Türkçe", "en": "İngilizce", "de": "Almanca",
    "fr": "Fransızca", "ar": "Arapça", "es": "İspanyolca",
    "ru": "Rusça", "zh": "Çince", "ja": "Japonca",
}


@router.get("/languages")
async def get_languages() -> dict:
    return {"languages": LANGUAGES}


class TranslateRequest(BaseModel):
    text: str
    source: str = "auto"   # auto = dil tespiti
    target: str = "tr"


@router.post("/text")
async def translate_text(req: TranslateRequest) -> dict:
    """Metni çevir. LLM + Helsinki-NLP modelleri kullanır."""
    if not req.text.strip():
        return {"error": "Metin boş"}

    # Helsinki-NLP opus-mt dene
    try:
        from transformers import pipeline
        model_name = f"Helsinki-NLP/opus-mt-{req.source}-{req.target}"
        if req.source == "auto":
            model_name = f"Helsinki-NLP/opus-mt-tc-big-en-{req.target}"
        translator = pipeline("translation", model=model_name)
        result = translator(req.text[:512])
        translated = result[0]["translation_text"]
        return {
            "original": req.text,
            "translated": translated,
            "source": req.source,
            "target": req.target,
            "method": "Helsinki-NLP",
        }
    except Exception as e:
        log.debug("Helsinki-NLP çeviri hatası: %s", e)

    # Fallback: LLM ile çevir
    try:
        from codegaai.core.engine import LLMEngine, GenerationConfig
        engine = LLMEngine.get()
        if not engine.is_ready:
            return {"error": "Model yüklü değil"}

        src_name = LANGUAGES.get(req.source, req.source)
        tgt_name = LANGUAGES.get(req.target, req.target)
        prompt = f"{src_name} → {tgt_name} çevir. Sadece çeviriyi yaz:\n\n{req.text}"
        msgs = [
            {"role": "system", "content": f"Sen bir çeviri asistanısın. Metni {tgt_name}'ye çevir."},
            {"role": "user", "content": prompt},
        ]
        translated = ""
        for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=500, temperature=0.2)):
            translated += tok
        return {
            "original": req.text,
            "translated": translated.strip(),
            "source": req.source,
            "target": req.target,
            "method": "LLM",
        }
    except Exception as e:
        return {"error": str(e)}


@router.post("/document")
async def translate_document(
    file: UploadFile = File(...),
    target: str = "tr",
) -> dict:
    """PDF veya TXT belgeyi çevir."""
    content = await file.read()
    fname = file.filename or "document"

    # Metin çıkar
    text = ""
    if fname.endswith(".pdf"):
        try:
            import fitz
            doc = fitz.open(stream=content, filetype="pdf")
            text = "\n".join(page.get_text() for page in doc)
        except ImportError:
            return {"error": "PDF için pymupdf gerekli: pip install pymupdf"}
    else:
        text = content.decode("utf-8", errors="replace")

    if not text.strip():
        return {"error": "Belgeden metin çıkarılamadı"}

    # Parçalara böl (LLM token limiti)
    chunks = [text[i:i+400] for i in range(0, min(len(text), 4000), 400)]
    translated_parts = []

    for chunk in chunks:
        result = await translate_text(TranslateRequest(text=chunk, target=target))
        translated_parts.append(result.get("translated", chunk))

    return {
        "filename": fname,
        "original_chars": len(text),
        "translated": "\n".join(translated_parts),
        "target": target,
        "chunks": len(chunks),
    }
