"""
codegaai.core.tools
=====================

LLM için araç (tool/function calling) sistemi.

Model, yanıt üretirken özel tag formatıyla araç çağırabilir:

    <tool>web_search("Python 3.13 yeni özellikler")</tool>
    <tool>calculate("137 * 42")</tool>
    <tool>run_python("import math; print(math.pi)")</tool>
    <tool>read_url("https://example.com")</tool>
    <tool>remember("Yunus Konya'da yaşıyor, web geliştirici")</tool>
    <tool>current_time()</tool>

Her araç:
1. Güvenlik sandboxu içinde çalışır
2. Zaman aşımı ile korunur
3. Sonuç model bağlamına enjekte edilir
4. Kullanıcı UI'da araç çağrılarını görebilir (gizli veya görünür)

Desteklenen araçlar:
- web_search(query, max=5): DuckDuckGo + ilk URL crawl
- calculate(expr): sympy veya eval ile matematik
- run_python(code): sınırlı sandbox, 5s timeout
- read_url(url): URL içeriği çek
- remember(fact): RAG belleğine kaydet
- recall(query): RAG belleğinde ara
- current_time(): Türkiye saati
- weather(city): OpenWeather (API key isteğe bağlı)
"""

from __future__ import annotations

import ast
import io
import re
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from codegaai.utils.logger import get_logger

log = get_logger(__name__)

TOOL_PATTERN = re.compile(
    r"<tool>(.*?)</tool>",
    re.DOTALL | re.IGNORECASE,
)

CALL_PATTERN = re.compile(
    r"(\w+)\((.*?)\)$",
    re.DOTALL,
)


# ============================================================
# Araç tanımları
# ============================================================

@dataclass
class ToolCall:
    name: str
    args: list[Any]
    raw: str
    result: Optional[str] = None
    error: Optional[str] = None
    elapsed_ms: int = 0


@dataclass
class ToolDef:
    name: str
    description: str
    fn: Callable
    safe: bool = True      # False ise kullanıcı onayı istenir (gelecek)
    timeout: int = 10      # saniye


# ============================================================
# Sandbox yardımcısı
# ============================================================

PYTHON_SANDBOX_GLOBALS = {
    "__builtins__": {
        # İzin verilen built-in'ler
        "print": print,
        "range": range,
        "len": len,
        "str": str,
        "int": int,
        "float": float,
        "bool": bool,
        "list": list,
        "dict": dict,
        "set": set,
        "tuple": tuple,
        "sorted": sorted,
        "reversed": reversed,
        "enumerate": enumerate,
        "zip": zip,
        "map": map,
        "filter": filter,
        "sum": sum,
        "min": min,
        "max": max,
        "abs": abs,
        "round": round,
        "isinstance": isinstance,
        "type": type,
        "repr": repr,
        "hex": hex,
        "bin": bin,
        "oct": oct,
        "chr": chr,
        "ord": ord,
        "pow": pow,
        "divmod": divmod,
        "hash": hash,
        "__import__": None,   # import yasak
    },
}

# Güvenli modüller
ALLOWED_MODULES = {
    "math", "cmath", "decimal", "fractions",
    "datetime", "time", "random",
    "string", "re", "json", "csv",
    "itertools", "functools", "collections",
    "statistics", "pathlib",
}

BLOCKED_PATTERNS = [
    r"\bimport\s+os\b", r"\bimport\s+sys\b",
    r"\bimport\s+subprocess\b", r"\bimport\s+socket\b",
    r"\bopen\s*\(", r"\bexec\s*\(", r"\beval\s*\(",
    r"\b__import__\b", r"\bgetattr\b", r"\bsetattr\b",
    r"\bdelattr\b", r"\bcompile\b", r"\bglobals\b",
    r"\bdir\s*\(", r"\bvars\s*\(", r"\bloc.*\(",
]


def _safe_import(name, *args, **kwargs):
    if name not in ALLOWED_MODULES:
        raise ImportError(f"'{name}' modülü bu ortamda yasak")
    return __import__(name, *args, **kwargs)


# ============================================================
# Araç implementasyonları
# ============================================================

def _tool_web_search(query: str, max: int = 3) -> str:
    """DuckDuckGo ile web araması yap."""
    try:
        import sys
        try:
            from duckduckgo_search import DDGS
        except ImportError:
            return "⚠️ duckduckgo-search paketi yüklü değil"

        query = query.strip().strip("\"'")
        max = int(max)

        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=min(max, 5)):
                results.append(
                    f"• **{r['title']}**\n  {r['body'][:300]}\n  {r['href']}"
                )

        if not results:
            return f"'{query}' için sonuç bulunamadı."

        return f"🔍 **Web Arama: {query}**\n\n" + "\n\n".join(results)

    except Exception as exc:
        return f"⚠️ Arama hatası: {exc}"


def _tool_calculate(expr: str) -> str:
    """Matematiksel hesaplama yap."""
    expr = expr.strip().strip("\"'")

    # Güvenlik: sadece matematiksel ifade
    blocked = re.compile(r"[a-zA-Z_]\w*\s*\(", re.IGNORECASE)
    if blocked.search(expr):
        # sympy dene
        try:
            import sympy  # type: ignore
            result = sympy.sympify(expr)
            return f"🧮 {expr} = {result}"
        except Exception:
            pass

    try:
        # Güvenli eval: sadece sayısal
        safe_globals = {"__builtins__": None}
        safe_locals = {
            "pi": 3.141592653589793, "e": 2.718281828459045,
            "sqrt": lambda x: x ** 0.5, "abs": abs,
        }
        result = eval(str(expr), safe_globals, safe_locals)  # noqa: S307
        return f"🧮 {expr} = {result}"
    except Exception as exc:
        return f"⚠️ Hesaplama hatası: {exc}"


def _tool_run_python(code: str) -> str:
    """Sandbox'ta Python kodu çalıştır (5 sn timeout)."""
    code = code.strip().strip("\"'")

    # Güvenlik kontrolü
    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, code):
            return f"⚠️ Güvenlik: bu kod çalıştırılamaz ('{pattern}')"

    output_buf = io.StringIO()
    error_buf = io.StringIO()
    result_holder: dict[str, Any] = {}

    def _run():
        try:
            sandbox_globals = {
                **PYTHON_SANDBOX_GLOBALS,
                "__builtins__": {
                    **PYTHON_SANDBOX_GLOBALS["__builtins__"],
                    "__import__": _safe_import,
                },
            }
            old_stdout = sys.stdout
            old_stderr = sys.stderr
            sys.stdout = output_buf
            sys.stderr = error_buf
            try:
                exec(compile(code, "<sandbox>", "exec"),  # noqa: S102
                     sandbox_globals, {})
            finally:
                sys.stdout = old_stdout
                sys.stderr = old_stderr
            result_holder["ok"] = True
        except Exception as exc:
            result_holder["error"] = str(exc)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    t.join(timeout=5.0)

    if t.is_alive():
        return "⚠️ Zaman aşımı: kod 5 saniyede bitmedi"

    if "error" in result_holder:
        return f"❌ Hata: {result_holder['error']}\n{error_buf.getvalue()}"

    output = output_buf.getvalue()
    if not output.strip():
        return "✅ Kod çalıştırıldı (çıktı yok)"
    return f"```\n{output.strip()}\n```"


def _tool_read_url(url: str) -> str:
    """Bir URL'nin içeriğini oku."""
    url = url.strip().strip("\"'")
    try:
        from codegaai.core.web_learner import WebLearner
        content = WebLearner.get().crawl(url, max_chars=4000)
        if not content:
            return f"⚠️ URL içeriği okunamadı: {url}"
        return f"📄 **{url}**\n\n{content}"
    except Exception as exc:
        return f"⚠️ URL okuma hatası: {exc}"


def _tool_remember(fact: str) -> str:
    """Bir bilgiyi RAG belleğine kaydet."""
    fact = fact.strip().strip("\"'")
    try:
        from codegaai.core.memory import MemoryStore
        mem = MemoryStore.get()
        mem.add(
            text=fact,
            metadata={"source": "tool_remember", "type": "user_fact"},
            collection="core",
        )
        return f"✅ Belleğe kaydedildi: \"{fact}\""
    except Exception as exc:
        return f"⚠️ Bellek kayıt hatası: {exc}"


def _tool_recall(query: str) -> str:
    """RAG belleğinde ara."""
    query = query.strip().strip("\"'")
    try:
        from codegaai.core.memory import MemoryStore
        mem = MemoryStore.get()
        results = mem.search(query, n_results=5, collections=["core", "archive"])
        if not results:
            return f"Belleğimde \"{query}\" hakkında bilgi yok."
        return "🧠 **Bellekten:**\n\n" + "\n\n".join(
            f"• {r['text'][:300]}" for r in results
        )
    except Exception as exc:
        return f"⚠️ Bellek arama hatası: {exc}"


def _tool_current_time() -> str:
    """Şu anki tarih ve saati döndür."""
    import datetime
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo("Europe/Istanbul")
        now = datetime.datetime.now(tz)
    except Exception:
        now = datetime.datetime.now()
    return f"🕐 {now.strftime('%d %B %Y, %A %H:%M:%S')} (Türkiye)"


def _tool_weather(city: str) -> str:
    """Şehir hava durumu (OpenWeather API veya web fallback)."""
    city = city.strip().strip("\"'")
    try:
        import httpx
        # Open-Meteo API — ücretsiz, API key yok, sadece koordinat
        # Önce şehri geocode et
        geo_r = httpx.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": city, "count": 1, "language": "tr"},
            timeout=10.0,
        )
        geo_r.raise_for_status()
        geo = geo_r.json().get("results", [])
        if not geo:
            return f"⚠️ '{city}' şehri bulunamadı"

        lat, lon = geo[0]["latitude"], geo[0]["longitude"]
        name = geo[0].get("name", city)

        w_r = httpx.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat, "longitude": lon,
                "current": "temperature_2m,wind_speed_10m,weathercode",
                "wind_speed_unit": "kmh",
                "timezone": "Europe/Istanbul",
            },
            timeout=10.0,
        )
        w_r.raise_for_status()
        wdata = w_r.json()["current"]
        temp = wdata["temperature_2m"]
        wind = wdata["wind_speed_10m"]

        return f"🌤 **{name} Hava Durumu**: {temp}°C, {wind} km/s rüzgar"

    except Exception as exc:
        return f"⚠️ Hava durumu alınamadı: {exc}"


# ============================================================
# Tool Registry
# ============================================================

def _tool_analyze_image(question: str = "Ne var burada?",
                         image_b64: str = "") -> str:
    """Yüklenmiş görüntüyü analiz et."""
    if not image_b64:
        return "⚠️ Görüntü verisi gerekli (image_b64)"
    try:
        from codegaai.core.vision_engine import VisionEngine
        engine = VisionEngine.get()
        if not engine.is_ready:
            engine.load("moondream2")
        result = engine.analyze(question=question, image_b64=image_b64,
                                max_tokens=300)
        return f"🖼️ **Görüntü Analizi**: {result}"
    except Exception as exc:
        return f"⚠️ Görüntü analiz hatası: {exc}"


def _tool_extract_text_image(image_b64: str = "") -> str:
    """Görüntüden metin çıkar (OCR)."""
    if not image_b64:
        return "⚠️ Görüntü verisi gerekli"
    try:
        from codegaai.core.ocr_engine import OCREngine
        engine = OCREngine.get()
        if not engine.available:
            return "⚠️ OCR kullanılamıyor. pip install easyocr"
        text = engine.extract_text(image_b64=image_b64, languages=["tr", "en"])
        return f"📝 **OCR Sonucu**:\n{text}"
    except Exception as exc:
        return f"⚠️ OCR hatası: {exc}"


TOOLS: dict[str, ToolDef] = {
    "web_search":   ToolDef("web_search", "DuckDuckGo web araması", _tool_web_search, timeout=15),
    "calculate":    ToolDef("calculate", "Matematik hesabı", _tool_calculate, timeout=5),
    "run_python":   ToolDef("run_python", "Python sandbox", _tool_run_python, timeout=6),
    "read_url":     ToolDef("read_url", "URL içeriği oku", _tool_read_url, timeout=15),
    "remember":     ToolDef("remember", "RAG belleğine kaydet", _tool_remember, timeout=5),
    "recall":       ToolDef("recall", "RAG'da ara", _tool_recall, timeout=5),
    "current_time": ToolDef("current_time", "Tarih/saat", _tool_current_time, timeout=2),
    "weather":      ToolDef("weather", "Hava durumu", _tool_weather, timeout=15),
    "analyze_image":     ToolDef("analyze_image", "Görüntü analizi (vision)", _tool_analyze_image, timeout=30),
    "extract_text_image": ToolDef("extract_text_image", "Görüntüden metin (OCR)", _tool_extract_text_image, timeout=30),
}


# ============================================================
# Ana işlem fonksiyonu
# ============================================================

def parse_and_run_tools(text: str) -> tuple[str, list[ToolCall]]:
    """
    Model çıktısındaki <tool>...</tool> bloklarını bul,
    araçları çalıştır, sonuçları metne yerleştir.

    Dönüş: (işlenmiş_metin, araç_çağrıları_listesi)
    """
    calls: list[ToolCall] = []
    result_text = text

    for m in TOOL_PATTERN.finditer(text):
        raw_call = m.group(1).strip()
        cm = CALL_PATTERN.match(raw_call)
        if not cm:
            continue

        tool_name = cm.group(1).strip()
        args_str = cm.group(2).strip()

        # Args parse
        try:
            args = list(ast.literal_eval(f"({args_str},)")) if args_str else []
        except Exception:
            args = [args_str] if args_str else []

        call = ToolCall(name=tool_name, args=args, raw=raw_call)

        tool_def = TOOLS.get(tool_name)
        if not tool_def:
            call.error = f"Bilinmeyen araç: {tool_name}"
            call.result = f"⚠️ {call.error}"
        else:
            t0 = time.time()
            result_holder: dict[str, Any] = {}

            def _runner(td=tool_def, a=args, rh=result_holder):
                try:
                    rh["result"] = td.fn(*a)
                except Exception as exc:
                    rh["error"] = str(exc)

            thread = threading.Thread(target=_runner, daemon=True)
            thread.start()
            thread.join(timeout=tool_def.timeout)

            call.elapsed_ms = int((time.time() - t0) * 1000)

            if thread.is_alive():
                call.error = f"Zaman aşımı ({tool_def.timeout}s)"
                call.result = f"⚠️ {call.error}"
            elif "error" in result_holder:
                call.error = result_holder["error"]
                call.result = f"⚠️ Araç hatası: {call.error}"
            else:
                call.result = result_holder.get("result", "")

        calls.append(call)

        # <tool>...</tool> bloğunu sonuçla değiştir
        tool_block = m.group(0)
        replacement = (
            f"\n\n> **[{tool_name}]** {call.result}\n\n"
        )
        result_text = result_text.replace(tool_block, replacement, 1)

    return result_text, calls


def tools_system_prompt() -> str:
    """
    Sistem prompt'una eklenecek araç açıklamaları.
    Model bu araçları nasıl kullanacağını bilsin.
    """
    defs = "\n".join(
        f"- `{name}(...)`: {td.description}"
        for name, td in TOOLS.items()
    )
    return f"""
## Araçlar (Tools)

Bilgi almanız, hesap yapmanız veya eylem gerçekleştirmeniz gerektiğinde araç kullanın.
Araç çağırma formatı (SADECE bu format, başka bir şey değil):

<tool>araç_adı("argüman")</tool>

Kullanılabilir araçlar:
{defs}

Örnekler:
<tool>web_search("Türkiye 2025 ekonomisi")</tool>
<tool>calculate("sqrt(144) + 5^2")</tool>
<tool>run_python("import math; print(math.factorial(10))")</tool>
<tool>current_time()</tool>
<tool>weather("Konya")</tool>
<tool>remember("Kullanıcının adı Yunus, Konya'da yaşıyor")</tool>

Kurallar:
1. Güncel bilgi gerektiren sorularda web_search kullanın
2. Matematiksel işlemlerde calculate kullanın
3. Kod çalıştırmak gerektiğinde run_python kullanın
4. Araç sonucunu değerlendirip kullanıcıya açıklayın
5. Tek seferde birden fazla araç kullanabilirsiniz (ayrı satırlarda)
"""
