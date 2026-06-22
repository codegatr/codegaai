"""
codegaai.core.answer_sanitizer
==============================

Small final-output cleanup layer.

Local models sometimes leak verifier labels or concatenate multiple candidate
answers with pipes. The UI should show one clean answer, not the model's
internal scratchpad.
"""

from __future__ import annotations

import re


_INTERNAL_LABEL_RE = re.compile(
    r"(?im)^\s*(?:"
    r"TEST|MLVC|ARL|SSV|SACV|Insan Yorumu|İnsan Yorumu|Human Comment|Final Answer"
    r")\s*:\s*"
)


def _normalize_for_dedupe(text: str) -> str:
    cleaned = _INTERNAL_LABEL_RE.sub("", str(text or ""))
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"[^\w\sğüşöçıİĞÜŞÖÇ]", "", cleaned, flags=re.UNICODE)
    return cleaned.casefold().strip()


def sanitize_final_answer(text: str) -> str:
    """Return a user-visible answer with leaked verifier noise removed."""
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

    value = _INTERNAL_LABEL_RE.sub("", value)

    if "|" in value:
        chunks = [chunk.strip() for chunk in value.split("|") if chunk.strip()]
        unique: list[str] = []
        seen: set[str] = set()
        for chunk in chunks:
            chunk = _INTERNAL_LABEL_RE.sub("", chunk).strip()
            key = _normalize_for_dedupe(chunk)
            if not key or key in seen:
                continue
            seen.add(key)
            unique.append(chunk)

        if unique:
            if len(unique) == 1:
                value = unique[0]
            else:
                value = "\n".join(unique)

    value = re.sub(r"\n{3,}", "\n\n", value)
    value = re.sub(r"[ \t]+", " ", value)
    return value.strip()


def architecture_plan_fallback(message: str) -> str:
    """Deterministic fallback for planning-only architecture requests."""
    subject = "Araç Sigorta ve Muayene Takip Sistemi"
    low = str(message or "").lower()
    if "araç" not in low and "arac" not in low:
        subject = "Yazılım Projesi"

    tables = (
        "users, vehicles, traffic_insurances, casco_policies, inspections, "
        "exhaust_emissions, maintenance_records, vehicle_documents, reminders, notifications"
    )
    return f"""# Analysis
Mevcut kod tabanı bu mesajdan doğrulanamıyor; bu nedenle {subject} için yeni proje mimarisi olarak plan hazırlanır. Kod yazılmadan önce domain, veri modeli, API, güvenlik, test ve deployment kararları netleşmelidir.

# Assumptions
- Backend Laravel, frontend Flutter olacaktır.
- Auth Laravel Sanctum ile yapılacaktır; Sanctum JWT olarak ele alınmayacaktır.
- Veritabanı MySQL olacaktır.
- Kullanıcı yalnızca kendi araç ve belgelerine erişecektir.

# Domain Model
Ana varlıklar: User, Vehicle, TrafficInsurance, CascoPolicy, Inspection, ExhaustEmission, MaintenanceRecord, VehicleDocument, Reminder, Notification.

# Database Design
Planlanacak tablolar: {tables}.
Her tabloda alanlar, veri tipleri, ilişkiler, indeksler, unique kurallar ve soft delete kararı migration aşamasında ayrı ayrı tanımlanmalıdır.

# API Design
REST kaynakları: /auth, /vehicles, /vehicles/{{vehicle}}/traffic-insurances, /casco-policies, /inspections, /exhaust-emissions, /maintenance-records, /documents, /reminders, /notifications.

# Laravel Architecture
Controller katmanı ince tutulur; FormRequest, Resource, Policy, Service/Action ve Job katmanları ayrılır. Reminder ve notification süreçleri queue + scheduler ile çalışır.

# Flutter Architecture
Clean Architecture klasörleri: core, features, data, domain, presentation, providers, widgets. Her feature kendi repository, usecase, provider ve page yapılarını taşır.

# Reminder & Notification System
30 gün, 15 gün, 7 gün, 1 gün kala ve süresi geçmiş kayıtlar için reminder oluşturulur; in-app ve e-posta bildirimleri queue üzerinden gönderilir.

# Security Plan
Sanctum auth, rate limit, ownership policy, güvenli dosya yükleme, private storage, masked logging ve IDOR koruması uygulanır.

# Testing Plan
Laravel Feature Test, Laravel Unit Test, Flutter Widget Test ve API test senaryoları ayrı yazılır.

# Deployment Plan
Docker, Nginx, MySQL, Queue Worker, Scheduler/Cron ve SSL ile production deployment hazırlanır.

# Risks
Yanlış tarih girişi, tekrar eden bildirimler, yetkisiz erişim, dosya upload güvenliği, queue/scheduler durması.

# First Implementation Tasks
1. Laravel + Flutter repo yapısını oluştur.
2. Sanctum auth kur.
3. Vehicle domain migration ve policy hazırla.
4. Sigorta/kasko tablolarını ekle.
5. Muayene/emisyon tablolarını ekle.
6. Bakım ve belge modüllerini ekle.
7. Reminder üretim joblarını yaz.
8. Notification merkezini kur.
9. Flutter Clean Architecture ekranlarını oluştur.
10. Test ve deployment pipeline kur."""
