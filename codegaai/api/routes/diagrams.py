"""
codegaai.api.routes.diagrams
=============================

Faz 52: Kod→Diyagram — kod analiz edip Mermaid diyagram üretir.

Endpoint'ler:
- POST /api/diagrams/from_code  — Kod → Mermaid
- POST /api/diagrams/explain    — Diyagram açıklaması
"""

from fastapi import APIRouter
from pydantic import BaseModel

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


class CodeInput(BaseModel):
    code: str
    language: str = "auto"  # auto, python, javascript, php, etc.
    diagram_type: str = "auto"  # auto, flowchart, sequence, class


@router.post("/from_code")
async def generate_diagram(input: CodeInput) -> dict:
    """Kod analiz edip Mermaid diyagram üret."""
    try:
        from codegaai.core.engine import LLMEngine
        engine = LLMEngine.get()

        if not engine.is_ready:
            return {"error": "Model yüklü değil"}

        # LLM ile kod analiz et
        prompt = f"""Şu kodu analiz et ve Mermaid diyagram oluştur:

Kod:
```{input.language}
{input.code}
```

Talimatlar:
- Kod akışını anla (fonksiyonlar, sınıflar, çağrılar)
- Uygun Mermaid diyagram tipi seç (flowchart, sequenceDiagram, classDiagram)
- SADECE Mermaid kodunu döndür, açıklama ekleme
- Türkçe etiketler kullan

Mermaid:"""

        response = engine.generate(
            [{"role": "user", "content": prompt}],
            max_tokens=800,
            temperature=0.3,
        )

        # Mermaid kodunu ayıkla
        mermaid = response.strip()
        if "```mermaid" in mermaid:
            mermaid = mermaid.split("```mermaid")[1].split("```")[0].strip()
        elif "```" in mermaid:
            mermaid = mermaid.split("```")[1].split("```")[0].strip()

        return {
            "mermaid": mermaid,
            "diagram_type": _detect_type(mermaid),
        }

    except Exception as e:
        log.error("Diyagram oluşturma hatası: %s", e)
        return {"error": str(e)}


@router.post("/explain")
async def explain_diagram(mermaid: str) -> dict:
    """Mermaid diyagramını açıkla."""
    try:
        from codegaai.core.engine import LLMEngine
        engine = LLMEngine.get()

        if not engine.is_ready:
            return {"error": "Model yüklü değil"}

        prompt = f"""Bu Mermaid diyagramını Türkçe açıkla (kısa, net):

```mermaid
{mermaid}
```

Açıklama:"""

        explanation = engine.generate(
            [{"role": "user", "content": prompt}],
            max_tokens=300,
            temperature=0.5,
        )

        return {"explanation": explanation.strip()}

    except Exception as e:
        log.error("Diyagram açıklama hatası: %s", e)
        return {"error": str(e)}


def _detect_type(mermaid: str) -> str:
    """Mermaid diyagram tipini tespit et."""
    m = mermaid.lower()
    if "sequencediagram" in m or "participant" in m:
        return "sequence"
    elif "classdiagram" in m or "class " in m:
        return "class"
    elif "graph" in m or "flowchart" in m:
        return "flowchart"
    elif "gantt" in m:
        return "gantt"
    elif "erdiagram" in m:
        return "er"
    else:
        return "unknown"
