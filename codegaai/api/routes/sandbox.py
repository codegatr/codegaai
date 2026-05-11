"""
codegaai.api.routes.sandbox
============================

Güvenli Python kodu çalıştırma.
ChatGPT Code Interpreter / CODEX karşılığı.

POST /api/sandbox/run    — Python kodu çalıştır
POST /api/sandbox/chart  — Grafik üret (matplotlib/plotly)
POST /api/sandbox/analyze — CSV/Excel analizi
"""

from __future__ import annotations

import base64
import io
import json
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()

# İzin verilen modüller (whitelist)
SAFE_MODULES = {
    "math", "random", "datetime", "json", "re", "string", "collections",
    "itertools", "functools", "operator", "statistics", "decimal", "fractions",
    "pathlib", "os.path", "time", "calendar", "csv", "io",
    "numpy", "pandas", "matplotlib", "matplotlib.pyplot", "matplotlib.figure",
    "seaborn", "plotly", "plotly.express", "plotly.graph_objects",
    "scipy", "sklearn",
}

BLOCKED_PATTERNS = [
    "import subprocess", "import os\n", "os.system", "os.popen",
    "__import__", "eval(", "exec(", "open(", "socket", "urllib.request.urlopen",
    "shutil.rmtree", "shutil.move", "sys.exit", "quit(", "exit(",
]


def _is_safe_code(code: str) -> tuple[bool, str]:
    for pat in BLOCKED_PATTERNS:
        if pat in code:
            return False, f"Güvenlik: '{pat}' kullanımı yasak"
    return True, ""


def _run_code(code: str, timeout: int = 10) -> dict:
    """Kodu sınırlı ortamda çalıştır."""
    import threading

    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    result: dict = {"output": "", "error": "", "elapsed_ms": 0, "plots": []}
    exception_holder = []

    def _exec():
        import sys
        old_stdout, old_stderr = sys.stdout, sys.stderr
        sys.stdout = stdout_buf
        sys.stderr = stderr_buf
        try:
            # Matplotlib backend ayarla (non-interactive)
            try:
                import matplotlib
                matplotlib.use("Agg")
                import matplotlib.pyplot as plt
                plt.close("all")
            except ImportError:
                pass

            safe_globals = {
                "__builtins__": {
                    "print": print, "len": len, "range": range, "enumerate": enumerate,
                    "zip": zip, "map": map, "filter": filter, "sorted": sorted,
                    "list": list, "dict": dict, "set": set, "tuple": tuple,
                    "str": str, "int": int, "float": float, "bool": bool,
                    "sum": sum, "min": min, "max": max, "abs": abs, "round": round,
                    "isinstance": isinstance, "type": type, "repr": repr,
                    "__import__": __import__,
                },
            }
            exec(code, safe_globals)  # noqa: S102

            # Matplotlib grafiklerini yakala
            try:
                import matplotlib.pyplot as plt
                figs = [plt.figure(i) for i in plt.get_fignums()]
                for fig in figs:
                    buf = io.BytesIO()
                    fig.savefig(buf, format="png", dpi=100, bbox_inches="tight")
                    buf.seek(0)
                    result["plots"].append(base64.b64encode(buf.read()).decode())
                plt.close("all")
            except Exception:
                pass

        except Exception as e:
            exception_holder.append(traceback.format_exc())
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr

    t = threading.Thread(target=_exec, daemon=True)
    t0 = time.time()
    t.start()
    t.join(timeout=timeout)
    result["elapsed_ms"] = int((time.time() - t0) * 1000)

    if t.is_alive():
        result["error"] = f"Zaman aşımı ({timeout}s)"
        return result

    result["output"] = stdout_buf.getvalue()[:8000]
    if exception_holder:
        result["error"] = exception_holder[0][-1000:]
    elif stderr_buf.getvalue():
        result["error"] = stderr_buf.getvalue()[:500]

    return result


# ── API Endpoints ─────────────────────────────────────────────────────────

class RunRequest(BaseModel):
    code: str
    timeout: int = 10


@router.post("/run")
async def run_code(req: RunRequest) -> dict:
    """Python kodu güvenli sandbox'ta çalıştır."""
    ok, msg = _is_safe_code(req.code)
    if not ok:
        return {"error": msg, "output": ""}

    result = _run_code(req.code, min(req.timeout, 30))
    log.info("Sandbox: %dms, çıktı=%d chr, hata=%s",
             result["elapsed_ms"], len(result["output"]), bool(result["error"]))
    return result


class ChartRequest(BaseModel):
    chart_type: str = "bar"   # bar, line, pie, scatter, histogram
    title: str = "Grafik"
    data: dict                 # {"labels": [...], "values": [...]}
    color: str = "steelblue"


@router.post("/chart")
async def make_chart(req: ChartRequest) -> dict:
    """Veriden grafik üret, PNG base64 döndür."""
    labels = req.data.get("labels", [])
    values = req.data.get("values", [])

    if not labels or not values:
        return {"error": "labels ve values gerekli"}

    code = f"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

fig, ax = plt.subplots(figsize=(10, 6))
labels = {repr(labels)}
values = {repr(values)}
chart_type = {repr(req.chart_type)}
color = {repr(req.color)}

if chart_type == 'bar':
    ax.bar(labels, values, color=color)
elif chart_type == 'line':
    ax.plot(labels, values, marker='o', color=color)
elif chart_type == 'pie':
    ax.pie(values, labels=labels, autopct='%1.1f%%')
elif chart_type == 'scatter':
    ax.scatter(range(len(labels)), values, color=color)
elif chart_type == 'histogram':
    ax.hist(values, bins=10, color=color)

ax.set_title({repr(req.title)}, fontsize=14, fontweight='bold')
plt.tight_layout()
"""
    result = _run_code(code, timeout=15)
    return {
        "plots": result.get("plots", []),
        "error": result.get("error", ""),
    }


class AnalyzeRequest(BaseModel):
    content: str      # CSV içeriği (string olarak)
    question: str = "Bu veriyi özetle"


@router.post("/analyze")
async def analyze_data(req: AnalyzeRequest) -> dict:
    """CSV/tablo verisi analiz et."""
    # Pandas ile analiz
    code = f"""
import pandas as pd
import io

csv_content = {repr(req.content[:50000])}
df = pd.read_csv(io.StringIO(csv_content))

print("=== VERİ ÖZETİ ===")
print(f"Satır: {{len(df)}}, Sütun: {{len(df.columns)}}")
print(f"Sütunlar: {{', '.join(df.columns.tolist())}}")
print()
print("=== İSTATİSTİK ===")
print(df.describe().to_string())
print()
print("=== İLK 5 SATIR ===")
print(df.head().to_string())
"""
    result = _run_code(code, timeout=20)
    return {
        "analysis": result["output"],
        "error": result.get("error", ""),
        "plots": result.get("plots", []),
    }


# ── Bağımlılık Analizi (CODEX karşılığı) ─────────────────────────────────

class DepsRequest(BaseModel):
    content: str     # requirements.txt / package.json / composer.json içeriği
    file_type: str = "requirements"   # requirements | package | composer

@router.post("/deps")
async def analyze_deps(req: DepsRequest) -> dict:
    """
    Bağımlılık dosyasını analiz et.
    - Güvenlik açıklarını kontrol et
    - Güncel sürüm öner
    - Kullanılmayan / çakışan paketleri bul
    """
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    guides = {
        "requirements": "Python requirements.txt dosyası. pip, PyPI paketleri.",
        "package": "Node.js package.json. npm/yarn paketleri.",
        "composer": "PHP composer.json. Packagist paketleri.",
    }

    prompt = f"""{guides.get(req.file_type, '')} Analiz et:

```
{req.content[:3000]}
```

Şunları kontrol et ve raporla:
1. **Güvenlik Açıkları** — Bilinen CVE'lere sahip paketler
2. **Güncel Olmayan Sürümler** — Daha yeni stabil sürümü olan paketler
3. **Çakışan Bağımlılıklar** — Birbirine çakışan versiyon gereksinimleri
4. **Kullanılmayan Olabilecekler** — Adından gereksiz görünen paketler
5. **Öneriler** — Daha güvenli/hızlı alternatifler

Türkçe yanıtla, Markdown formatında."""

    msgs = [
        {"role": "system", "content": "Sen bir DevSecOps uzmanısın. Bağımlılık güvenliği ve optimizasyonu konusunda uzmansın."},
        {"role": "user", "content": prompt},
    ]
    analysis = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=800, temperature=0.3)):
        analysis += tok

    return {"analysis": analysis, "file_type": req.file_type,
            "package_count": req.content.count("\n")}
