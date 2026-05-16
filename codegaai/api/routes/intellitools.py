"""
codegaai.api.routes.intellitools
==================================

Faz 40 — i18n / Çoklu Dil Desteği    Kodu otomatik çevir + dil dosyası üret
Faz 41 — API Mock Sunucu              Endpoint'ten otomatik mock response üret
Faz 42 — Git Zekası                   Commit açıklaması, changelog, blame analizi
"""
from __future__ import annotations

import json, re, time, uuid
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


# ══════════════════════════════════════════════════════════
# FAZ 40 — i18n / Çoklu Dil Desteği
# ══════════════════════════════════════════════════════════

class I18nExtractRequest(BaseModel):
    code: str
    language: str = "php"
    source_lang: str = "tr"
    target_langs: list[str] = ["en", "de", "ar"]


@router.post("/i18n/extract")
async def i18n_extract(req: I18nExtractRequest) -> dict:
    """Koddan string'leri çıkar + çeviri dosyaları üret — Faz 40."""
    # String'leri çıkar
    if req.language == "php":
        patterns = [
            r"__\(['\"]([^'\"]+)['\"]\)",          # __('string')
            r"_e\(['\"]([^'\"]+)['\"]\)",           # _e('string')
            r"Lang::get\(['\"]([^'\"]+)['\"]\)",    # Laravel
            r"trans\(['\"]([^'\"]+)['\"]\)",        # trans()
        ]
    else:
        patterns = [
            r"t\(['\"]([^'\"]+)['\"]\)",            # t('string')
            r"i18n\.['\"]([^'\"]+)['\"]",           # i18n.key
            r"gettext\(['\"]([^'\"]+)['\"]\)",      # gettext
        ]

    strings = set()
    for pat in patterns:
        strings.update(re.findall(pat, req.code))

    if not strings:
        # Hardcoded string'leri bul
        if req.language == "php":
            for m in re.finditer(r"echo\s+['\"]([^'\"]{5,50})['\"]", req.code):
                strings.add(m.group(1))

    strings = list(strings)[:50]  # Max 50

    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    translations: dict[str, dict] = {}

    if strings and engine.is_ready:
        strings_json = json.dumps(strings, ensure_ascii=False)
        msgs = [
            {"role": "system", "content":
             f"Çevirici asistan. JSON formatında döndür: "
             f'{{"en": {{"string": "translation"}}, "de": {{}}, "ar": {{}}}}'},
            {"role": "user", "content":
             f"Bu string'leri {req.source_lang}'den "
             f"{', '.join(req.target_langs)}'a çevir:\n{strings_json}"},
        ]
        raw = ""
        for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=800, temperature=0.1)):
            raw += tok
        try:
            m = re.search(r'\{.*\}', raw, re.DOTALL)
            if m:
                translations = json.loads(m.group(0))
        except Exception:
            pass

    # Dil dosyaları üret
    files = {}
    # Kaynak dil
    files[f"lang/{req.source_lang}.json"] = json.dumps(
        {s: s for s in strings}, ensure_ascii=False, indent=2)
    # Hedef diller
    for lang in req.target_langs:
        lang_data = {s: translations.get(lang, {}).get(s, s) for s in strings}
        files[f"lang/{lang}.json"] = json.dumps(lang_data, ensure_ascii=False, indent=2)

    return {
        "strings_found": len(strings),
        "strings": strings[:20],
        "files": files,
        "translations": translations,
        "phase": "Faz 40",
    }


class I18nGenerateRequest(BaseModel):
    strings: dict       # {"key": "Türkçe değer"}
    target_langs: list[str] = ["en", "de"]


@router.post("/i18n/translate")
async def i18n_translate(req: I18nGenerateRequest) -> dict:
    """Dil dosyasını diğer dillere çevir — Faz 40."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    results = {}
    for lang in req.target_langs:
        msgs = [
            {"role": "system", "content":
             f"JSON çevirici. Türkçe'den {lang}'a çevir. Sadece JSON döndür."},
            {"role": "user", "content":
             f"Çevir:\n{json.dumps(req.strings, ensure_ascii=False)[:2000]}"},
        ]
        raw = ""
        for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=500, temperature=0.1)):
            raw += tok
        try:
            m = re.search(r'\{.*\}', raw, re.DOTALL)
            results[lang] = json.loads(m.group(0)) if m else {}
        except Exception:
            results[lang] = {}

    return {"translations": results, "key_count": len(req.strings), "phase": "Faz 40"}


# ══════════════════════════════════════════════════════════
# FAZ 41 — API Mock Sunucu
# ══════════════════════════════════════════════════════════

_mocks: dict[str, dict] = {}   # path → {method: response}


class MockCreateRequest(BaseModel):
    endpoints: list[dict]   # [{"path": "/users", "method": "GET", "response": {...}}]
    auto_generate: bool = True  # AI ile response üret (response yoksa)


@router.post("/mock/create")
async def mock_create(req: MockCreateRequest) -> dict:
    """Mock endpoint'ler oluştur — Faz 41."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    created = []

    for ep in req.endpoints:
        path   = ep.get("path", "/test")
        method = ep.get("method", "GET").upper()
        resp   = ep.get("response")

        if not resp and req.auto_generate and engine.is_ready:
            msgs = [
                {"role": "system", "content": "REST API mock response üreticisi. Sadece JSON döndür."},
                {"role": "user", "content":
                 f"{method} {path} için gerçekçi mock response üret. "
                 f"Schema: {ep.get('schema', 'belirtilmemiş')}"},
            ]
            raw = ""
            for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=300, temperature=0.4)):
                raw += tok
            try:
                m = re.search(r'[\[\{].*[\]\}]', raw, re.DOTALL)
                resp = json.loads(m.group(0)) if m else {"data": "mock"}
            except Exception:
                resp = {"data": "mock", "path": path, "method": method}

        key = f"{method}:{path}"
        _mocks[key] = {
            "path": path, "method": method, "response": resp,
            "created_at": time.strftime("%H:%M:%S"),
            "call_count": 0,
        }
        created.append({"path": path, "method": method, "url": f"/api/intellitools/mock/serve{path}"})

    return {"created": created, "total_mocks": len(_mocks), "phase": "Faz 41"}


@router.api_route("/mock/serve/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def mock_serve(path: str, request_method: str = "GET") -> dict:
    """Mock response döndür — Faz 41."""
    from fastapi import Request
    full_path = "/" + path
    for method in ["GET", "POST", "PUT", "DELETE", "PATCH"]:
        key = f"{method}:{full_path}"
        if key in _mocks:
            _mocks[key]["call_count"] += 1
            return _mocks[key]["response"]
    return {"error": f"Mock bulunamadı: {full_path}",
            "available": list(_mocks.keys())}


@router.get("/mock/list")
async def mock_list() -> dict:
    return {
        "mocks": [
            {k: v for k, v in m.items() if k != "response"}
            for m in _mocks.values()
        ],
        "count": len(_mocks),
        "phase": "Faz 41",
    }


@router.delete("/mock/clear")
async def mock_clear() -> dict:
    _mocks.clear()
    return {"ok": True, "phase": "Faz 41"}


class MockFromSpecRequest(BaseModel):
    openapi_json: str   # OpenAPI/Swagger JSON


@router.post("/mock/from-spec")
async def mock_from_spec(req: MockFromSpecRequest) -> dict:
    """OpenAPI spec'ten otomatik mock oluştur — Faz 41."""
    try:
        spec = json.loads(req.openapi_json)
        paths = spec.get("paths", {})
        endpoints = []
        for path, methods in paths.items():
            for method, details in methods.items():
                if method.upper() in ("GET", "POST", "PUT", "DELETE", "PATCH"):
                    endpoints.append({
                        "path": path, "method": method.upper(),
                        "schema": str(details.get("responses", {}))[:200],
                    })
        create_req = MockCreateRequest(endpoints=endpoints[:20], auto_generate=True)
        return await mock_create(create_req)
    except Exception as e:
        return {"error": str(e), "phase": "Faz 41"}


# ══════════════════════════════════════════════════════════
# FAZ 42 — Git Zekası
# ══════════════════════════════════════════════════════════

class CommitMessageRequest(BaseModel):
    diff: str           # git diff çıktısı
    context: str = ""   # Proje bağlamı
    style: str = "conventional"  # conventional | simple | detailed


@router.post("/git/commit-message")
async def generate_commit_message(req: CommitMessageRequest) -> dict:
    """Diff'ten otomatik commit mesajı üret — Faz 42."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    style_desc = {
        "conventional": "Conventional Commits (feat:, fix:, docs:, style:, refactor:, test:, chore:)",
        "simple":       "Kısa ve öz, tek satır",
        "detailed":     "Başlık + boş satır + detaylı açıklama paragrafı",
    }.get(req.style, "conventional")

    msgs = [
        {"role": "system", "content":
         f"Git commit mesajı üreticisi. Format: {style_desc}. Türkçe yaz."},
        {"role": "user", "content":
         f"Bu git diff için commit mesajı yaz:\n\n```diff\n{req.diff[:3000]}\n```"
         f"{f'Bağlam: {req.context}' if req.context else ''}"},
    ]
    message = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=200, temperature=0.3)):
        message += tok

    # Kod bloğunu temizle
    message = re.sub(r"```\w*\n?|```", "", message).strip()
    # İlk satır = başlık
    lines = message.splitlines()
    title = lines[0].strip() if lines else message
    body  = "\n".join(lines[2:]).strip() if len(lines) > 2 else ""

    return {
        "message": message.strip(),
        "title": title,
        "body": body,
        "style": req.style,
        "phase": "Faz 42",
    }


class ChangelogRequest(BaseModel):
    commits: list[str]   # Commit mesajları listesi
    version: str = ""
    from_date: str = ""


@router.post("/git/changelog")
async def generate_changelog(req: ChangelogRequest) -> dict:
    """Commit listesinden CHANGELOG üret — Faz 42."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    commits_text = "\n".join(f"- {c}" for c in req.commits[:50])
    msgs = [
        {"role": "system", "content":
         "CHANGELOG üreticisi. Keep a Changelog formatı kullan. Türkçe yaz."},
        {"role": "user", "content":
         f"Bu commit'lerden CHANGELOG üret:\n{commits_text}\n\n"
         f"Versiyon: {req.version or 'vX.Y.Z'}\n"
         f"Tarih: {req.from_date or time.strftime('%Y-%m-%d')}\n\n"
         "Kategoriler: Added, Changed, Fixed, Removed, Security, Deprecated"},
    ]
    changelog = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=600, temperature=0.3)):
        changelog += tok

    return {
        "changelog": changelog.strip(),
        "commit_count": len(req.commits),
        "version": req.version,
        "phase": "Faz 42",
    }


class BlameAnalysisRequest(BaseModel):
    blame_output: str    # git blame çıktısı
    question: str = "Bu kodun en sorunlu bölümleri neresi?"


@router.post("/git/blame-analyze")
async def blame_analyze(req: BlameAnalysisRequest) -> dict:
    """git blame çıktısını analiz et — Faz 42."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    # Blame'den author istatistikleri çıkar
    authors: dict[str, int] = {}
    for m in re.finditer(r'\(([^)]+?)\s+\d{4}-\d{2}-\d{2}', req.blame_output):
        author = m.group(1).strip().split()[-1]  # Son sözcük = isim soyisim
        authors[author] = authors.get(author, 0) + 1

    msgs = [
        {"role": "system", "content": "Git blame analisti. Kod kalitesi ve sahiplik analizi."},
        {"role": "user", "content":
         f"git blame çıktısı:\n```\n{req.blame_output[:2000]}\n```\n\n"
         f"Soru: {req.question}\n\n"
         "Yazar istatistiklerini ve kod bölümlerini analiz et."},
    ]
    analysis = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=500, temperature=0.3)):
        analysis += tok

    return {
        "analysis": analysis.strip(),
        "author_stats": authors,
        "top_author": max(authors, key=authors.get) if authors else None,
        "phase": "Faz 42",
    }


class PRDescriptionRequest(BaseModel):
    diff: str
    branch_name: str = ""
    related_issues: list[str] = []


@router.post("/git/pr-description")
async def generate_pr_description(req: PRDescriptionRequest) -> dict:
    """PR açıklaması otomatik üret — Faz 42."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    issues = "\n".join(f"Closes #{i}" for i in req.related_issues) if req.related_issues else ""
    msgs = [
        {"role": "system", "content":
         "GitHub PR açıklaması üreticisi. Markdown formatı kullan. Türkçe yaz."},
        {"role": "user", "content":
         f"Bu diff için PR açıklaması yaz:\n"
         f"Dal: {req.branch_name}\n"
         f"```diff\n{req.diff[:2500]}\n```\n\n"
         "Şunları dahil et: ## Değişiklikler, ## Test, ## Notlar"
         f"{f', {issues}' if issues else ''}"},
    ]
    description = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=600, temperature=0.3)):
        description += tok

    return {
        "description": description.strip(),
        "branch": req.branch_name,
        "phase": "Faz 42",
    }
