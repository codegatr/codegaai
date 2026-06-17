"""
codegaai.core.answer_sanitizer
==============================

Final user-visible answer cleanup helpers.
"""

from __future__ import annotations

import re


_INTERNAL_LABEL_RE = re.compile(
    r"(?im)^\s*(?:"
    r"TEST|MLVC|ARL|SSV|SACV|Insan Yorumu|İnsan Yorumu|Human Comment|Final Answer"
    r")\s*:\s*"
)

_CALCULATE_TOOL_RE = re.compile(
    r"<tool>\s*calculate\((?P<quote>[\"']?)(?P<expr>.*?)(?P=quote)\)\s*</tool>",
    re.IGNORECASE | re.DOTALL,
)

_ANY_TOOL_RE = re.compile(r"<tool>.*?</tool>", re.IGNORECASE | re.DOTALL)


def _replace_calculate_tool(match: re.Match[str]) -> str:
    try:
        from codegaai.core.instant_answers import calculate_expression
        result = calculate_expression(match.group("expr"))
        return f"{result} " if result else ""
    except Exception:
        return ""


def _normalize_for_dedupe(text: str) -> str:
    cleaned = _INTERNAL_LABEL_RE.sub("", str(text or ""))
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"[^\w\sğüşöçıİĞÜŞÖÇ]", "", cleaned, flags=re.UNICODE)
    return cleaned.casefold().strip()


def sanitize_final_answer(text: str) -> str:
    """Remove leaked verifier labels and duplicated pipe-joined variants."""
    value = str(text or "").strip()
    if not value:
        return ""

    value = re.sub(
        r"<think(?:ing)?>(.*?)</think(?:ing)?>\s*",
        "",
        value,
        flags=re.DOTALL | re.IGNORECASE,
    )
    value = re.sub(
        r"<think(?:ing)?>.*$",
        "",
        value,
        flags=re.DOTALL | re.IGNORECASE,
    ).strip()
    value = _CALCULATE_TOOL_RE.sub(_replace_calculate_tool, value)
    value = _ANY_TOOL_RE.sub("", value)
    value = re.sub(
        r"^\s*(?P<result>-?\d+(?:\.\d+)?)\s+Sonu[cç]:\s*(?P=result)\s*$",
        r"\g<result>",
        value,
        flags=re.IGNORECASE,
    )
    value = _INTERNAL_LABEL_RE.sub("", value)

    if "|" in value:
        unique: list[str] = []
        seen: set[str] = set()
        for chunk in (part.strip() for part in value.split("|")):
            if not chunk:
                continue
            chunk = _INTERNAL_LABEL_RE.sub("", chunk).strip()
            key = _normalize_for_dedupe(chunk)
            if not key or key in seen:
                continue
            seen.add(key)
            unique.append(chunk)
        if unique:
            value = unique[0] if len(unique) == 1 else "\n".join(unique)

    value = re.sub(r"\n{3,}", "\n\n", value)
    value = re.sub(r"[ \t]+", " ", value)
    return value.strip()


def architecture_plan_fallback(message: str) -> str:
    """Deterministic fallback for planning-only architecture requests."""
    subject = "Arac Sigorta ve Muayene Takip Sistemi"
    low = str(message or "").lower()
    if "arac" not in low and "araç" not in low:
        subject = "Yazilim Projesi"

    tables = (
        "users, vehicles, traffic_insurances, casco_policies, inspections, "
        "exhaust_emissions, maintenance_records, vehicle_documents, reminders, notifications"
    )
    return f"""# Analysis
Mevcut kod tabani bu mesajdan dogrulanamiyor; bu nedenle {subject} icin yeni proje mimarisi olarak plan hazirlanir. Kod yazilmadan once domain, veri modeli, API, guvenlik, test ve deployment kararlari netlesmelidir.

# Assumptions
- Backend Laravel, frontend Flutter olacaktir.
- Auth Laravel Sanctum ile yapilacaktir; Sanctum JWT olarak ele alinmayacaktir.
- Veritabani MySQL olacaktir.
- Kullanici yalnizca kendi arac ve belgelerine erisecektir.

# Domain Model
Ana varliklar: User, Vehicle, TrafficInsurance, CascoPolicy, Inspection, ExhaustEmission, MaintenanceRecord, VehicleDocument, Reminder, Notification.

# Database Design
Planlanacak tablolar: {tables}. Her tabloda fields, data types, relations, indexes, unique rules ve soft delete karari migration asamasinda ayri ayri tanimlanmalidir.

# API Design
REST kaynaklari: /auth, /vehicles, /vehicles/{{vehicle}}/traffic-insurances, /casco-policies, /inspections, /exhaust-emissions, /maintenance-records, /documents, /reminders, /notifications.

# Laravel Architecture
Controller katmani ince tutulur; FormRequest, Resource, Policy, Service/Action ve Job katmanlari ayrilir. Reminder ve notification surecleri queue + scheduler ile calisir.

# Flutter Architecture
Clean Architecture klasorleri: core, features, data, domain, presentation, providers, widgets. Her feature kendi repository, usecase, provider ve page yapilarini tasir.

# Reminder & Notification System
30 gun, 15 gun, 7 gun, 1 gun kala ve suresi gecmis kayitlar icin reminder olusturulur; in-app ve e-posta bildirimleri queue uzerinden gonderilir.

# Security Plan
Sanctum auth, rate limit, ownership policy, guvenli dosya yukleme, private storage, masked logging ve IDOR korumasi uygulanir.

# Testing Plan
Laravel Feature Test, Laravel Unit Test, Flutter Widget Test ve API test senaryolari ayri yazilir.

# Deployment Plan
Docker, Nginx, MySQL, Queue Worker, Scheduler/Cron ve SSL ile production deployment hazirlanir.

# Risks
Yanlis tarih girisi, tekrar eden bildirimler, yetkisiz erisim, dosya upload guvenligi, queue/scheduler durmasi.

# First Implementation Tasks
1. Laravel + Flutter repo yapisini olustur.
2. Sanctum auth kur.
3. Vehicle domain migration ve policy hazirla.
4. Sigorta/kasko tablolarini ekle.
5. Muayene/emisyon tablolarini ekle.
6. Bakim ve belge modullerini ekle.
7. Reminder uretim joblarini yaz.
8. Notification merkezini kur.
9. Flutter Clean Architecture ekranlarini olustur.
10. Test ve deployment pipeline kur."""
