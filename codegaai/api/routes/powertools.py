"""
codegaai.api.routes.powertools
================================

Faz 43 — Bağımlılık Güvenlik Denetimi   CVE tarama, güncel olmayan paketler
Faz 44 — Akıllı Yeniden Adlandırma      Tüm projede güvenli rename/refactor
Faz 45 — API Dokümantasyon Üretici      OpenAPI/Swagger + Postman koleksiyonu
"""
from __future__ import annotations

import json, re, time
from pathlib import Path
from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


# ══════════════════════════════════════════════════════════
# FAZ 43 — Bağımlılık Güvenlik Denetimi
# ══════════════════════════════════════════════════════════

# Bilinen kritik CVE'ler (offline veritabanı — temel liste)
_KNOWN_VULNS = {
    # format: "paket": [("min_version", "max_version", "CVE", "açıklama", "severity")]
    "pillow": [("0", "10.0.0", "CVE-2023-44271", "DoS via unbounded reads", "high")],
    "requests": [("0", "2.31.0", "CVE-2023-32681", "Proxy header injection", "medium")],
    "pyyaml": [("0", "6.0", "CVE-2022-1471", "RCE via yaml.load", "critical")],
    "cryptography": [("0", "41.0.0", "CVE-2023-38325", "NULL pointer deref", "high")],
    "urllib3": [("0", "1.26.18", "CVE-2023-43804", "Cookie leakage", "medium"),
                ("2.0.0", "2.0.6", "CVE-2023-45803", "Request body in redirect", "medium")],
    "werkzeug": [("0", "3.0.1", "CVE-2023-46136", "DoS via multipart", "high")],
    "setuptools": [("0", "65.5.1", "CVE-2022-40897", "ReDoS", "medium")],
    "paramiko": [("0", "3.3.0", "CVE-2023-48795", "Terrapin attack", "high")],
    "aiohttp": [("0", "3.9.0", "CVE-2023-49082", "CRLF injection", "medium")],
    "tornado": [("0", "6.3.3", "CVE-2023-28370", "Open redirect", "medium")],
}


def _parse_version(v: str) -> tuple:
    """'1.2.3' → (1, 2, 3)"""
    try:
        parts = re.sub(r"[^0-9.]", "", v.split("+")[0]).split(".")
        return tuple(int(x) for x in parts[:3])
    except Exception:
        return (0,)


def _version_in_range(ver: str, min_v: str, max_v: str) -> bool:
    v  = _parse_version(ver)
    mn = _parse_version(min_v)
    mx = _parse_version(max_v)
    return mn <= v <= mx


def _parse_requirements(content: str) -> list[dict]:
    """requirements.txt içeriğini parse et."""
    pkgs = []
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # pip format: package==1.0.0, package>=1.0.0, package
        m = re.match(r"^([a-zA-Z0-9_\-\.]+)\s*([><=!~]{1,3})\s*([\d\.]+)?", line)
        if m:
            pkgs.append({
                "name": m.group(1).lower().replace("-", "_"),
                "op":   m.group(2) or "any",
                "ver":  m.group(3) or "0",
                "raw":  line,
            })
    return pkgs


class DependencyAuditRequest(BaseModel):
    content: str         # requirements.txt veya composer.json içeriği
    format: str = "pip"  # pip | composer | npm | cargo


@router.post("/depaudit/scan")
async def dependency_audit(req: DependencyAuditRequest) -> dict:
    """Bağımlılıkları güvenlik açığı için tara — Faz 43."""
    packages = []
    if req.format == "pip":
        packages = _parse_requirements(req.content)
    elif req.format == "composer":
        try:
            data = json.loads(req.content)
            for pkg, ver in {**data.get("require", {}), **data.get("require-dev", {})}.items():
                packages.append({"name": pkg.lower().split("/")[-1],
                                  "ver": re.sub(r"[^0-9.]", "", ver) or "0", "raw": f"{pkg}: {ver}"})
        except Exception:
            pass
    elif req.format == "npm":
        try:
            data = json.loads(req.content)
            for pkg, ver in {**data.get("dependencies", {}), **data.get("devDependencies", {})}.items():
                packages.append({"name": pkg.lower(), "ver": re.sub(r"[^0-9.]", "", ver) or "0",
                                  "raw": f"{pkg}: {ver}"})
        except Exception:
            pass

    vulnerabilities = []
    safe_count = 0
    for pkg in packages:
        name = pkg["name"]
        ver  = pkg.get("ver", "0")
        vulns_for_pkg = _KNOWN_VULNS.get(name, [])
        found = False
        for min_v, max_v, cve, desc, severity in vulns_for_pkg:
            if _version_in_range(ver, min_v, max_v):
                vulnerabilities.append({
                    "package":   pkg["raw"],
                    "cve":       cve,
                    "severity":  severity,
                    "description": desc,
                    "fix":       f"{name} sürümünü {max_v} üzerine güncelleyin",
                })
                found = True
        if not found:
            safe_count += 1

    # LLM ile ek analiz (büyük paketler için)
    ai_notes = ""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if engine.is_ready and packages:
        pkg_list = "\n".join(p["raw"] for p in packages[:20])
        msgs = [{"role": "user", "content":
                 f"Bu {req.format} bağımlılıklarını güvenlik açısından değerlendir:\n{pkg_list}\n\n"
                 "Güncel olmayan, riskli veya dikkat edilmesi gereken paketleri listele. "
                 "Kısa tut (max 200 kelime)."}]
        for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=250, temperature=0.3)):
            ai_notes += tok

    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for v in vulnerabilities:
        severity_counts[v["severity"]] = severity_counts.get(v["severity"], 0) + 1

    return {
        "vulnerabilities": vulnerabilities,
        "safe_packages":   safe_count,
        "total_packages":  len(packages),
        "severity_summary": severity_counts,
        "risk_level": ("critical" if severity_counts["critical"] > 0 else
                       "high"     if severity_counts["high"] > 0 else
                       "medium"   if severity_counts["medium"] > 0 else "low"),
        "ai_notes": ai_notes.strip(),
        "phase": "Faz 43",
    }


@router.post("/depaudit/file")
async def audit_file(file: UploadFile = File(...)) -> dict:
    content = (await file.read()).decode("utf-8", errors="replace")
    fname   = file.filename or ""
    fmt = ("composer" if "composer" in fname else
           "npm"      if "package.json" in fname else "pip")
    return await dependency_audit(DependencyAuditRequest(content=content, format=fmt))


@router.post("/depaudit/update-suggestions")
async def update_suggestions(req: DependencyAuditRequest) -> dict:
    """Güncel olmayan paketler için güncelleme komutu üret — Faz 43."""
    audit = await dependency_audit(req)
    commands = []
    for v in audit["vulnerabilities"]:
        pkg_name = re.search(r"^([a-zA-Z0-9_\-]+)", v["package"])
        if pkg_name:
            if req.format == "pip":
                commands.append(f"pip install --upgrade {pkg_name.group(1)}")
            elif req.format == "npm":
                commands.append(f"npm update {pkg_name.group(1)}")
            elif req.format == "composer":
                commands.append(f"composer update {pkg_name.group(1)}")
    return {"commands": list(set(commands)), "vulnerability_count": len(audit["vulnerabilities"]),
            "phase": "Faz 43"}


# ══════════════════════════════════════════════════════════
# FAZ 44 — Akıllı Yeniden Adlandırma (Safe Rename)
# ══════════════════════════════════════════════════════════

class RenameRequest(BaseModel):
    code: str
    old_name: str
    new_name: str
    language: str = "php"
    rename_type: str = "variable"  # variable | function | class | constant | method


def _smart_rename(code: str, old: str, new: str, lang: str, rtype: str) -> dict:
    """Güvenli yeniden adlandırma — bağlam duyarlı."""
    changes = 0
    result  = code

    if lang == "php":
        if rtype == "variable":
            # $old → $new (string içinde değil)
            result, n = re.subn(rf'\$({re.escape(old)})\b', f"${new}", result)
            changes += n
        elif rtype == "function":
            # function old( → function new(
            result, n = re.subn(rf'\b({re.escape(old)})\s*\(', f"{new}(", result)
            changes += n
        elif rtype == "class":
            result, n = re.subn(rf'\b{re.escape(old)}\b', new, result)
            changes += n
        elif rtype == "constant":
            # Büyük harf constant (define/const)
            result, n = re.subn(rf'\b{re.escape(old)}\b', new, result)
            changes += n
    elif lang == "python":
        if rtype in ("variable", "function", "class", "method"):
            # import ifadelerinde dikkatli ol
            result, n = re.subn(
                rf'(?<!\.)(?<!\w)\b{re.escape(old)}\b(?!\w)(?!\s*=\s*import)',
                new, result
            )
            changes += n
    else:  # js/ts
        result, n = re.subn(rf'\b{re.escape(old)}\b', new, result)
        changes += n

    return {"result": result, "changes_made": changes}


class BatchRenameRequest(BaseModel):
    files: dict[str, str]   # {filename: content}
    old_name: str
    new_name: str
    language: str = "php"
    rename_type: str = "function"


@router.post("/rename/single")
async def rename_single(req: RenameRequest) -> dict:
    """Tek dosyada güvenli yeniden adlandırma — Faz 44."""
    result = _smart_rename(req.code, req.old_name, req.new_name,
                            req.language, req.rename_type)

    # LLM ile doğrula
    ai_check = ""
    if result["changes_made"] > 0:
        from codegaai.core.engine import LLMEngine, GenerationConfig
        engine = LLMEngine.get()
        if engine.is_ready:
            msgs = [{"role": "user", "content":
                     f"'{req.old_name}' → '{req.new_name}' değişikliği yapıldı ({req.language}).\n"
                     f"Kod: ```{req.language}\n{result['result'][:1000]}\n```\n"
                     "Bu değişikliğin sorun yaratacağı bir yer var mı? Kısa yanıt."}]
            for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=150, temperature=0.2)):
                ai_check += tok

    return {**result, "ai_check": ai_check.strip(), "phase": "Faz 44"}


@router.post("/rename/batch")
async def rename_batch(req: BatchRenameRequest) -> dict:
    """Çoklu dosyada toplu yeniden adlandırma — Faz 44."""
    results = {}
    total_changes = 0
    for fname, content in req.files.items():
        r = _smart_rename(content, req.old_name, req.new_name,
                          req.language, req.rename_type)
        results[fname] = r
        total_changes += r["changes_made"]
    return {
        "files": results,
        "total_changes": total_changes,
        "files_affected": sum(1 for r in results.values() if r["changes_made"] > 0),
        "phase": "Faz 44",
    }


@router.post("/rename/preview")
async def rename_preview(req: RenameRequest) -> dict:
    """Değişiklik önizlemesi (dry-run) — Faz 44."""
    r = _smart_rename(req.code, req.old_name, req.new_name,
                      req.language, req.rename_type)
    # Diff üret
    import difflib
    diff = "".join(difflib.unified_diff(
        req.code.splitlines(keepends=True),
        r["result"].splitlines(keepends=True),
        fromfile=f"before ({req.old_name})",
        tofile=f"after ({req.new_name})",
        n=3,
    ))
    return {
        "changes_count": r["changes_made"],
        "diff": diff[:3000],
        "safe": r["changes_made"] > 0,
        "phase": "Faz 44",
    }


# ══════════════════════════════════════════════════════════
# FAZ 45 — API Dokümantasyon Üretici
# ══════════════════════════════════════════════════════════

class APIDocRequest(BaseModel):
    code: str
    language: str = "php"
    format: str = "openapi"   # openapi | postman | markdown | apidoc
    base_url: str = "http://localhost"
    api_version: str = "1.0.0"
    title: str = "API"


def _extract_endpoints_php(code: str) -> list[dict]:
    """PHP kodundan endpoint'leri çıkar."""
    endpoints = []
    # Route::get('/path', ...) veya $router->get('/path', ...)
    for m in re.finditer(
        r"(?:Route::|router->)(get|post|put|patch|delete|any)\s*\(\s*['\"]([^'\"]+)['\"]",
        code, re.IGNORECASE
    ):
        method = m.group(1).upper()
        path   = m.group(2)
        # Yorumdan summary çıkarmaya çalış
        before = code[max(0, m.start()-200):m.start()]
        comment = ""
        cm = re.search(r"//\s*(.+)\n\s*$", before)
        if cm:
            comment = cm.group(1).strip()
        endpoints.append({"method": method, "path": path, "summary": comment})
    return endpoints


def _extract_endpoints_python(code: str) -> list[dict]:
    """FastAPI/Flask kodundan endpoint'leri çıkar."""
    endpoints = []
    for m in re.finditer(
        r'@(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*["\']([^"\']+)["\']',
        code, re.IGNORECASE
    ):
        method  = m.group(1).upper()
        path    = m.group(2)
        # Altındaki fonksiyon adını al
        fn = re.search(r'async\s+def\s+(\w+)|def\s+(\w+)', code[m.end():m.end()+100])
        summary = fn.group(1) or fn.group(2) if fn else path.strip("/")
        endpoints.append({"method": method, "path": path, "summary": summary})
    return endpoints


@router.post("/apidoc/generate")
async def generate_api_doc(req: APIDocRequest) -> dict:
    """Koddan API dokümantasyonu üret — Faz 45."""
    # Endpoint'leri çıkar
    if req.language == "python":
        endpoints = _extract_endpoints_python(req.code)
    else:
        endpoints = _extract_endpoints_php(req.code)

    # LLM ile zenginleştir
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    enriched_endpoints = []
    if engine.is_ready and endpoints:
        ep_list = "\n".join(f"- {e['method']} {e['path']}: {e['summary']}"
                            for e in endpoints[:15])
        msgs = [{"role": "system", "content": "REST API dokümantasyon uzmanı. JSON döndür."},
                {"role": "user", "content":
                 f"Bu {req.language} API endpoint'leri için OpenAPI spec üret:\n{ep_list}\n\n"
                 f"Her endpoint için JSON:\n"
                 f'[{{"path":"/x","method":"GET","summary":"...","params":[],"responses":{{"200":"..."}}}}]'}]
        raw = ""
        for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=800, temperature=0.2)):
            raw += tok
        try:
            m2 = re.search(r'\[.*\]', raw, re.DOTALL)
            if m2:
                enriched_endpoints = json.loads(m2.group(0))
        except Exception:
            enriched_endpoints = endpoints

    # Çıktı formatı
    if req.format == "openapi":
        spec = {
            "openapi": "3.0.0",
            "info": {"title": req.title, "version": req.api_version},
            "servers": [{"url": req.base_url}],
            "paths": {},
        }
        for ep in (enriched_endpoints or endpoints):
            path = ep.get("path", "/")
            method = ep.get("method", "GET").lower()
            spec["paths"].setdefault(path, {})[method] = {
                "summary": ep.get("summary", ""),
                "responses": {"200": {"description": "Başarılı"}},
            }
        output = json.dumps(spec, ensure_ascii=False, indent=2)
        filename = "openapi.json"

    elif req.format == "postman":
        collection = {
            "info": {"name": req.title, "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
            "item": [
                {
                    "name": f"{ep.get('method','GET')} {ep.get('path','/')}",
                    "request": {
                        "method": ep.get("method", "GET"),
                        "url": {"raw": f"{req.base_url}{ep.get('path','/path')}"},
                        "header": [{"key": "Content-Type", "value": "application/json"}],
                    },
                }
                for ep in (enriched_endpoints or endpoints)
            ],
        }
        output = json.dumps(collection, ensure_ascii=False, indent=2)
        filename = "postman_collection.json"

    elif req.format == "markdown":
        lines = [f"# {req.title} API Referansı\n\n**Versiyon:** {req.api_version}  \n**Base URL:** {req.base_url}\n"]
        for ep in (enriched_endpoints or endpoints):
            lines.append(f"\n## `{ep.get('method','GET')}` {ep.get('path','/')}")
            lines.append(f"\n{ep.get('summary','')}\n")
            lines.append("**Yanıt:** 200 OK\n")
        output = "\n".join(lines)
        filename = "API_REFERENCE.md"
    else:
        output = str(enriched_endpoints or endpoints)
        filename = "api_doc.txt"

    # ZIP olarak sun
    import io, zipfile, uuid
    from codegaai.api.routes.files import _zip_store
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(filename, output)
    zid = uuid.uuid4().hex[:8]
    _zip_store[zid] = {"data": buf.getvalue(), "filename": f"{req.title}_doc.zip", "ts": time.time()}

    return {
        "endpoints_found": len(endpoints),
        "format": req.format,
        "filename": filename,
        "zip_id": zid,
        "download_url": f"/api/files/download/{zid}",
        "preview": output[:800],
        "phase": "Faz 45",
    }


@router.get("/apidoc/formats")
async def list_formats() -> dict:
    return {
        "formats": ["openapi", "postman", "markdown", "apidoc"],
        "phase": "Faz 45"
    }
