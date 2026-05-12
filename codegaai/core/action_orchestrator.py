"""
codegaai.core.action_orchestrator
=================================

Small action-first runtime for requests that must produce a concrete artifact.

This mirrors the useful shape of agentic coding tools: classify the user intent,
run deterministic tools, keep a trace, and return a deliverable instead of a
planning-only chat answer.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Awaitable, Callable


ProgressCallback = Callable[[str], None]
WebReader = Callable[[str], Awaitable[str]]


@dataclass
class ActionOutcome:
    handled: bool
    content: str = ""
    artifact_url: str = ""
    artifact_name: str = ""
    trace: list[str] = field(default_factory=list)


def fold_text(text: str) -> str:
    table = str.maketrans({
        "ı": "i", "İ": "i", "ğ": "g", "Ğ": "g", "ü": "u", "Ü": "u",
        "ş": "s", "Ş": "s", "ö": "o", "Ö": "o", "ç": "c", "Ç": "c",
    })
    return str(text or "").translate(table).lower()


def is_delivery_request(message: str) -> bool:
    msg = fold_text(message)
    artifacts = [
        "zip", "dosya", "dosyalari", "veritabani", "database", "schema", "sql",
        "php", "web sitesi", "web sayfasi", "website", "site", "proje",
        "uygulama", "sistem", "arac", "kiralama", "rent a car", "rentacar",
    ]
    actions = [
        "olustur", "hazirla", "yap", "uret", "ver", "teslim", "indir",
        "paketle", "kodla", "gelistir", "tasarla",
    ]
    if "zip" in msg and any(a in msg for a in ["olustur", "hazirla", "ver", "teslim", "indir", "paketle"]):
        return True
    if "php" in msg and any(a in msg for a in ["veritabani", "database", "sql", "zip", "dosya"]):
        return True
    if re.search(r"\b[\w.-]+\.(?:com|net|org|com\.tr|tr)\b", msg) and any(a in msg for a in actions):
        return True
    return any(a in msg for a in artifacts) and any(a in msg for a in actions)


def is_model_escape(content: str) -> bool:
    msg = fold_text(content)
    markers = [
        "zip dosyasi olusturamadim",
        "sistemimde bir zip",
        "zip dosyasi olusturam",
        "bunun yerine",
        "stratejik plan",
        "nasil yardimci olabilirim",
        "planlayabiliriz",
        "hangi sayfalarin olusturulacagini",
        "kod dogrudan yazabilme",
        "kod yazma yetenegim yok",
        "dosya olusturma yetenegim yok",
        "yetenegim yok",
        "yetenegim bulunmuyor",
    ]
    return any(marker in msg for marker in markers)


def project_meta_from_message(message: str) -> tuple[str, str]:
    msg = fold_text(message)
    if any(w in msg for w in ["arac", "kiralama", "rent a car", "rentacar"]):
        return "arac_kiralama", "arac_kiralama_db"
    if "php" in msg:
        return "php_proje", "php_proje_db"
    return "codega_project", "codega_project_db"


def _has_reference_site(message: str) -> bool:
    return bool(re.search(r"https?://|\b[\w.-]+\.(?:com|net|org|com\.tr|tr)\b", message, re.IGNORECASE))


def format_project_response(result: dict, db_name: str, trace: list[str], source_context: str = "", rescued: bool = False) -> str:
    files = ", ".join(f"`{f}`" for f in result.get("files", [])[:8])
    source_line = "\n- Kaynak sayfa incelendi ve tasarim/fonksiyon yapisi projeye uyarlandi." if source_context else ""
    intro = (
        "Teslim guard devreye girdi; plan/refusal yerine projeyi olusturdum."
        if rescued
        else "Ise koyuldum; yorum yapmak yerine projeyi olusturdum."
    )
    trace_lines = "\n".join(f"- {step}" for step in trace[-6:])
    return (
        f"{intro}\n\n"
        f"- Proje: `{result['filename']}`\n"
        f"- Dosya sayisi: {result['file_count']}\n"
        f"- Veritabani: `{db_name}` / `schema.sql` dahil\n"
        f"- Dosyalar: {files}"
        f"{source_line}\n\n"
        f"Calisma ozeti:\n{trace_lines}\n\n"
        f"[ZIP'i indir]({result['download_url']})"
    )


async def run_action_first(
    message: str,
    progress: ProgressCallback,
    web_reader: WebReader | None = None,
    rescued: bool = False,
) -> ActionOutcome:
    if not is_delivery_request(message):
        return ActionOutcome(handled=False)

    from codegaai.api.routes.files import create_php_project_zip

    trace: list[str] = []

    def step(text: str) -> None:
        trace.append(text)
        progress(text)

    step("Talimat teslim isi olarak algilandi")
    source_context = ""
    if web_reader and _has_reference_site(message):
        step("Referans web sayfasi/kaynak bilgisi inceleniyor")
        try:
            source_context = await web_reader(message)
            if source_context:
                step("Referans ozeti projeye eklendi")
            else:
                step("Referans okunamadi; yerel uretim sablonuyla devam")
        except Exception:
            step("Referans okunamadi; yerel uretim sablonuyla devam")

    project_name, db_name = project_meta_from_message(message)
    step("PHP 8.3 dosya agaci ve SQL semasi uretiliyor")
    result = create_php_project_zip(
        message,
        project_name=project_name,
        db_name=db_name,
        php_version="8.3",
        source_context=source_context,
    )
    step("ZIP paketi hazirlandi")
    return ActionOutcome(
        handled=True,
        content=format_project_response(result, db_name, trace, source_context, rescued=rescued),
        artifact_url=result.get("download_url", ""),
        artifact_name=result.get("filename", ""),
        trace=trace,
    )
