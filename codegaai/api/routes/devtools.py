"""
codegaai.api.routes.devtools
==============================

Faz 37 — Güvenlik Tarayıcısı (SAST)    Kaynak kod güvenlik analizi
Faz 38 — Test Üretici                   Unit + integration + e2e testler
Faz 39 — Performans Profiler            Kod kompleksitesi + darboğaz tespiti
"""
from __future__ import annotations

import ast, re, time
from pathlib import Path

from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


# ══════════════════════════════════════════════════════════
# FAZ 37 — Güvenlik Tarayıcısı (SAST)
# ══════════════════════════════════════════════════════════

# Kural tabanlı zafiyet tespiti (LLM olmadan da çalışır)
_PHP_PATTERNS = {
    "SQL Injection": [
        (r'mysql_query\s*\(\s*["\'].*\$', "mysql_query'de değişken — prepared statement kullan"),
        (r'->query\s*\(\s*["\'].*\$', "PDO query'de değişken — prepare()/execute() kullan"),
        (r'sprintf.*SELECT.*%s', "sprintf ile SQL birleştirme — parametre bağlama kullan"),
    ],
    "XSS": [
        (r'echo\s+\$_(GET|POST|REQUEST|COOKIE)', "Temizlenmemiş kullanıcı verisi — htmlspecialchars() ekle"),
        (r'print\s+\$_(GET|POST|REQUEST)', "Temizlenmemiş kullanıcı verisi"),
        (r'innerHTML\s*=\s*.*\$', "innerHTML ile değişken atama — textContent kullan"),
    ],
    "Command Injection": [
        (r'system\s*\(\s*\$', "system() ile değişken — escapeshellarg() kullan"),
        (r'exec\s*\(\s*\$', "exec() ile değişken — doğrudan kullanıcı girdisi tehlikeli"),
        (r'shell_exec\s*\(\s*\$', "shell_exec() ile değişken — tehlikeli"),
        (r'passthru\s*\(\s*\$', "passthru() ile değişken"),
    ],
    "Path Traversal": [
        (r'file_get_contents\s*\(\s*\$', "file_get_contents'te değişken — yol doğrulama gerekli"),
        (r'include\s*\(\s*\$', "include ile değişken — local file inclusion riski"),
        (r'require\s*\(\s*\$', "require ile değişken — tehlikeli"),
    ],
    "Zayıf Kriptografi": [
        (r'md5\s*\(', "MD5 kırılabilir — password_hash() kullan"),
        (r'sha1\s*\(', "SHA1 zayıf — bcrypt/argon2 kullan"),
        (r'base64_encode.*password', "Parola base64 ile saklanmış — şifreleme gerekli"),
    ],
    "Veri Sızıntısı": [
        (r'var_dump|print_r|phpinfo', "Debug fonksiyonu — production'da kaldır"),
        (r'error_reporting\s*\(\s*E_ALL', "Tam hata raporlama — production'da kapalı olmalı"),
        (r'display_errors\s*=\s*1', "display_errors aktif — production'da kapalı olmalı"),
    ],
}

_PY_PATTERNS = {
    "SQL Injection": [
        (r'execute\s*\(\s*["\'].*%s.*%', "execute'te string format — parametreli sorgu kullan"),
        (r'cursor\.execute\(.*\.format\(', ".format() ile SQL — ? placeholder kullan"),
    ],
    "Command Injection": [
        (r'os\.system\s*\(.*input', "os.system ile input — subprocess.run + shlex kullan"),
        (r'subprocess\.call\s*\(.*shell=True.*input', "shell=True ile input — tehlikeli"),
    ],
    "Pickle Deserialization": [
        (r'pickle\.loads?\s*\(', "pickle.load — güvenilmeyen veri tehlikeli"),
        (r'yaml\.load\s*\((?!.*Loader)', "yaml.load — yaml.safe_load kullan"),
    ],
    "Hardcoded Secrets": [
        (r'password\s*=\s*["\'][^"\']{8,}["\']', "Hardcoded parola — env değişkeni kullan"),
        (r'api_key\s*=\s*["\'][^"\']{10,}["\']', "Hardcoded API key"),
        (r'secret\s*=\s*["\'][^"\']{8,}["\']', "Hardcoded secret"),
    ],
}


def _static_scan(code: str, language: str) -> list[dict]:
    patterns = _PHP_PATTERNS if language == "php" else _PY_PATTERNS
    findings = []
    lines = code.splitlines()
    for vuln_type, rules in patterns.items():
        for pattern, desc in rules:
            for i, line in enumerate(lines, 1):
                if re.search(pattern, line, re.IGNORECASE):
                    findings.append({
                        "type": vuln_type,
                        "line": i,
                        "code": line.strip()[:100],
                        "description": desc,
                        "severity": "high" if vuln_type in ("SQL Injection", "Command Injection")
                                    else "medium",
                    })
    return findings


class SASTRequest(BaseModel):
    code: str
    language: str = "php"
    ai_analysis: bool = True   # LLM ile derinlemesine analiz


@router.post("/sast/scan")
async def sast_scan(req: SASTRequest) -> dict:
    """Güvenlik açıklarını tara (kural + AI) — Faz 37."""
    # Kural tabanlı tarama (hızlı)
    static_findings = _static_scan(req.code, req.language)

    ai_report = ""
    if req.ai_analysis:
        from codegaai.core.engine import LLMEngine, GenerationConfig
        engine = LLMEngine.get()
        if engine.is_ready:
            msgs = [
                {"role": "system", "content":
                 "Sen bir uygulama güvenliği uzmanısın (AppSec). "
                 "Kodu OWASP Top 10 + CWE listesine göre analiz et."},
                {"role": "user", "content":
                 f"Bu {req.language} kodunu güvenlik açısından analiz et:\n\n"
                 f"```{req.language}\n{req.code[:3000]}\n```\n\n"
                 "Her bulgu için:\n"
                 "- **[SEVİYE] Açık Adı** (CWE-XXX)\n"
                 "- Açıklama ve saldırı senaryosu\n"
                 "- Düzeltilmiş kod örneği"},
            ]
            for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=1000, temperature=0.2)):
                ai_report += tok

    severity_counts = {
        "critical": 0, "high": 0, "medium": 0, "low": 0
    }
    for f in static_findings:
        sev = f.get("severity", "medium")
        severity_counts[sev] = severity_counts.get(sev, 0) + 1

    return {
        "findings": static_findings,
        "ai_report": ai_report.strip(),
        "summary": {
            "total": len(static_findings),
            **severity_counts,
        },
        "risk_score": min(100, len(static_findings) * 12 + severity_counts["high"] * 20),
        "phase": "Faz 37",
    }


@router.post("/sast/scan-file")
async def sast_scan_file(file: UploadFile = File(...)) -> dict:
    """Yüklenen dosyayı tara — Faz 37."""
    content = (await file.read()).decode("utf-8", errors="replace")
    ext = Path(file.filename or "file.php").suffix.lower()[1:]
    lang = "php" if ext in ("php",) else "python" if ext == "py" else "php"
    req = SASTRequest(code=content, language=lang, ai_analysis=False)
    result = await sast_scan(req)
    return {**result, "filename": file.filename}


# ══════════════════════════════════════════════════════════
# FAZ 38 — Test Üretici
# ══════════════════════════════════════════════════════════

class TestGenRequest(BaseModel):
    code: str
    language: str = "python"   # python | php | javascript
    framework: str = ""        # pytest | phpunit | jest | auto
    test_type: str = "unit"    # unit | integration | e2e
    coverage_focus: str = "all"  # all | happy_path | edge_cases | error_handling


_FRAMEWORK_MAP = {
    "python": {"unit": "pytest", "integration": "pytest", "e2e": "playwright"},
    "php":    {"unit": "phpunit", "integration": "phpunit", "e2e": "codeception"},
    "javascript": {"unit": "jest", "integration": "jest", "e2e": "playwright"},
    "typescript": {"unit": "jest", "integration": "jest", "e2e": "playwright"},
}


@router.post("/testgen")
async def generate_tests(req: TestGenRequest) -> dict:
    """Fonksiyon/sınıf için otomatik test üret — Faz 38."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    framework = req.framework or _FRAMEWORK_MAP.get(
        req.language, {}).get(req.test_type, "pytest")

    coverage_desc = {
        "all":            "mutlu yol + kenar durumlar + hata işleme",
        "happy_path":     "normal/beklenen kullanım senaryoları",
        "edge_cases":     "sınır değerleri, boş girdi, aşırı değerler",
        "error_handling": "hata durumları ve exception'lar",
    }.get(req.coverage_focus, "tüm durumlar")

    msgs = [
        {"role": "system", "content":
         f"Sen bir {framework} test uzmanısın. "
         f"Kapsamlı, çalışan {req.test_type} testleri yaz."},
        {"role": "user", "content":
         f"Bu {req.language} kodu için {framework} ile {req.test_type} testleri yaz.\n"
         f"Kapsam: {coverage_desc}\n\n"
         f"```{req.language}\n{req.code[:3000]}\n```\n\n"
         f"Şunları dahil et:\n"
         f"- En az 6 test metodu\n"
         f"- Mock/stub kullanımı (gerekiyorsa)\n"
         f"- Açıklayıcı test isimleri (test_when_X_then_Y formatı)\n"
         f"- Her metodun docstring'i\n"
         f"Sadece test kodunu döndür."},
    ]
    test_code = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=1500, temperature=0.25)):
        test_code += tok

    # Kod bloğunu temizle
    m = re.search(rf"```(?:{req.language}|python|php|javascript)?\n(.*?)```",
                  test_code, re.DOTALL)
    if m:
        test_code = m.group(1)

    # Test sayısını say
    if req.language == "python":
        test_count = len(re.findall(r'^def test_', test_code, re.MULTILINE))
    elif req.language == "php":
        test_count = len(re.findall(r'public function test', test_code))
    else:
        test_count = len(re.findall(r'\bit\s*\(|test\s*\(', test_code))

    # Dosya adı öner
    file_names = {
        "python": "test_module.py",
        "php":    "ModuleTest.php",
        "javascript": "module.test.js",
    }

    return {
        "test_code": test_code.strip(),
        "framework": framework,
        "test_type": req.test_type,
        "test_count": test_count,
        "filename": file_names.get(req.language, "test_file"),
        "phase": "Faz 38",
    }


@router.post("/testgen/mutation")
async def mutation_test_suggestions(req: BaseModel) -> dict:
    """Mutasyon test senaryoları öner — Faz 38."""
    return {"message": "testgen endpoint'ini kullanın", "phase": "Faz 38"}


# ══════════════════════════════════════════════════════════
# FAZ 39 — Performans Profiler
# ══════════════════════════════════════════════════════════

class ProfilerRequest(BaseModel):
    code: str
    language: str = "python"
    profile_type: str = "static"  # static | runtime_estimate | complexity


def _cyclomatic_complexity(code: str, language: str) -> dict:
    """McCabe döngüsel karmaşıklık hesapla."""
    # Karar noktaları: if, elif, for, while, case, and, or, except
    decision_patterns = [
        r'\bif\b', r'\belif\b', r'\belse\b', r'\bfor\b',
        r'\bwhile\b', r'\bcase\b', r'\bcatch\b', r'\bexcept\b',
        r'\band\b', r'\bor\b', r'\b\?\s*:', r'\b&&\b', r'\b\|\|\b'
    ]
    lines = code.splitlines()
    total_complexity = 1  # Başlangıç: 1
    func_complexities = []
    current_func = None
    current_count = 0

    for line in lines:
        stripped = line.strip()
        # Fonksiyon tespiti
        if language == "python" and stripped.startswith("def "):
            if current_func:
                func_complexities.append({"name": current_func, "complexity": current_count})
            current_func = re.search(r'def\s+(\w+)', stripped)
            current_func = current_func.group(1) if current_func else "?"
            current_count = 1
        elif language == "php" and re.search(r'function\s+\w+', stripped):
            if current_func:
                func_complexities.append({"name": current_func, "complexity": current_count})
            m = re.search(r'function\s+(\w+)', stripped)
            current_func = m.group(1) if m else "?"
            current_count = 1

        for pat in decision_patterns:
            current_count += len(re.findall(pat, stripped, re.IGNORECASE))
        total_complexity += sum(len(re.findall(p, stripped, re.IGNORECASE))
                                for p in decision_patterns[:6])  # if/elif/for/while/case/except

    if current_func:
        func_complexities.append({"name": current_func, "complexity": current_count})

    return {
        "total": total_complexity,
        "functions": func_complexities,
        "risk": "low" if total_complexity < 10 else "medium" if total_complexity < 25 else "high",
    }


def _detect_bottlenecks(code: str, language: str) -> list[dict]:
    """Statik darboğaz tespiti."""
    issues = []
    lines = code.splitlines()

    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        # N+1 sorgu
        if re.search(r'(for|foreach|while).*\n.*query|SELECT', code[max(0, i-2):i+50], re.DOTALL):
            pass  # Basit heuristic, false positive riskli

        # İç içe döngü
        indent = len(line) - len(line.lstrip())
        if re.search(r'\b(for|while|foreach)\b', stripped) and indent > 8:
            issues.append({
                "line": i,
                "type": "İç İçe Döngü",
                "description": "Derin iç içe döngü — O(n²) veya daha kötü karmaşıklık riski",
                "severity": "medium",
            })

        # Tekrarlayan string birleştirme
        if re.search(r'\+=\s*["\']|\.\s*=\s*["\']', stripped):
            if re.search(r'\b(for|while|foreach)\b', "\n".join(lines[max(0, i-5):i])):
                issues.append({
                    "line": i,
                    "type": "String Birleştirme Döngüde",
                    "description": "Döngüde string+= — implode/join kullan",
                    "severity": "medium",
                })

        # Sleep/blocking
        if re.search(r'\bsleep\s*\(\s*[1-9]', stripped):
            issues.append({
                "line": i,
                "type": "Blocking Sleep",
                "description": "sleep() — async veya event-based mimari düşün",
                "severity": "low",
            })

        # Global değişken
        if re.search(r'\bglobal\s+\$', stripped) and language == "php":
            issues.append({
                "line": i,
                "type": "Global Değişken",
                "description": "Global değişken — DI/singleton pattern kullan",
                "severity": "low",
            })

    return issues[:20]


@router.post("/profiler/analyze")
async def profile_code(req: ProfilerRequest) -> dict:
    """Kod performans analizi — Faz 39."""
    complexity = _cyclomatic_complexity(req.code, req.language)
    bottlenecks = _detect_bottlenecks(req.code, req.language)

    # Metrikler
    lines = req.code.splitlines()
    loc = len([l for l in lines if l.strip() and not l.strip().startswith("#")])
    comment_ratio = len([l for l in lines if l.strip().startswith(("#", "//", "/*", "*"))]) / max(len(lines), 1)

    # LLM ile derin analiz
    ai_suggestions = ""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if engine.is_ready:
        msgs = [
            {"role": "system", "content": "Sen bir performans optimizasyon uzmanısın."},
            {"role": "user", "content":
             f"Bu {req.language} kodunun performansını analiz et:\n\n"
             f"```{req.language}\n{req.code[:2500]}\n```\n\n"
             f"Zaten tespit edilenler: "
             f"Döngüsel karmaşıklık: {complexity['total']}, "
             f"{len(bottlenecks)} darboğaz.\n\n"
             "Şunları ver:\n"
             "1. En kritik 3 performans sorunu\n"
             "2. Her biri için optimizasyon önerisi ve kod örneği\n"
             "3. Tahmini performans kazanımı"},
        ]
        for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=800, temperature=0.25)):
            ai_suggestions += tok

    return {
        "metrics": {
            "loc": loc,
            "complexity": complexity,
            "comment_ratio": round(comment_ratio * 100, 1),
            "bottleneck_count": len(bottlenecks),
        },
        "bottlenecks": bottlenecks,
        "ai_suggestions": ai_suggestions.strip(),
        "grade": (
            "A" if complexity["total"] < 5  and not bottlenecks else
            "B" if complexity["total"] < 10 and len(bottlenecks) < 3 else
            "C" if complexity["total"] < 20 else "D"
        ),
        "phase": "Faz 39",
    }


@router.post("/profiler/runtime")
async def runtime_profile(req: BaseModel) -> dict:
    """Gerçek zamanlı profil — Faz 39."""
    return {"message": "profiler/analyze endpoint'ini kullanın", "phase": "Faz 39"}
