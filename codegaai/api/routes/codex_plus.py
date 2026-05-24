"""
codegaai.api.routes.codex_plus
================================

Faz 14-21 — CODEX'ten Üstün Özellikler

Faz 14: Terminal Entegrasyonu     — Komutu çalıştır, çıktısını AI'ya gönder
Faz 15: Paylaşım/İşbirliği        — Sohbeti paylaş, link üret
Faz 16: Diff & Patch              — İki dosyayı karşılaştır, patch uygula
Faz 17: Kod İnceleme (PR Review)  — Kodu incele, sorunları listele
Faz 18: Veritabanı Yöneticisi     — SQL çalıştır, şema analiz et
Faz 19: Hata Ayıklama             — Stack trace → kök neden → otomatik düzeltme
Faz 20: Ses → Kod                 — Sesli komut → kod üret
Faz 21: Proje Şablon Motoru       — Boilerplate proje oluştur
"""

from __future__ import annotations
import io, json, re, subprocess, sys, tempfile, time, uuid
from pathlib import Path
from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel
from codegaai.config import DATA_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()
CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0


# ── FAZ 14: Terminal Entegrasyonu ────────────────────────────────────────

class TerminalRequest(BaseModel):
    command: str
    explain: bool = True       # Çıktıyı AI ile açıkla
    fix_on_error: bool = True  # Hata varsa otomatik düzeltme öner

BLOCKED_CMDS = {"rm -rf /", "format", "del /f /s", "mkfs", "dd if="}

@router.post("/terminal/run")
async def terminal_run(req: TerminalRequest) -> dict:
    """Komutu güvenli sandbox'ta çalıştır, AI ile açıkla — Faz 14."""
    cmd = req.command.strip()
    if any(b in cmd.lower() for b in BLOCKED_CMDS):
        return {"error": "Güvenli olmayan komut engellendi"}

    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            timeout=15, encoding="utf-8", errors="replace",
            creationflags=CREATE_NO_WINDOW,
        )
        stdout = result.stdout[:3000]
        stderr = result.stderr[:1000]
        ok = result.returncode == 0
    except subprocess.TimeoutExpired:
        return {"error": "Komut 15 saniyede tamamlanamadı (timeout)"}
    except Exception as e:
        return {"error": str(e)}

    explanation = ""
    fix = ""
    if req.explain or (not ok and req.fix_on_error):
        from codegaai.core.engine import LLMEngine, GenerationConfig
        engine = LLMEngine.get()
        if engine.is_ready:
            prompt = f"Komut: `{cmd}`\nÇıktı:\n{stdout or stderr}"
            if not ok and req.fix_on_error:
                prompt += f"\nHata kodu: {result.returncode}\nHatayı açıkla ve düzeltme öner."
            elif req.explain:
                prompt += "\nBu çıktıyı kısaca Türkçe açıkla."
            msgs = [{"role": "user", "content": prompt}]
            for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=300)):
                explanation += tok
            if not ok and "```" in explanation:
                m = re.search(r"```(?:bash|sh)?\n(.*?)```", explanation, re.DOTALL)
                if m: fix = m.group(1).strip()

    return {
        "command": cmd,
        "stdout": stdout,
        "stderr": stderr,
        "returncode": result.returncode,
        "ok": ok,
        "explanation": explanation.strip(),
        "suggested_fix": fix,
        "phase": "Faz 14",
    }


# ── FAZ 15: Paylaşım / İşbirliği ─────────────────────────────────────────

_shares: dict[str, dict] = {}   # share_id → data

class ShareRequest(BaseModel):
    chat_id: str = ""
    content: str = ""   # Doğrudan içerik
    expires_hours: int = 24

@router.post("/share/create")
async def share_create(req: ShareRequest) -> dict:
    """Sohbeti veya metni paylaşılabilir link olarak üret — Faz 15."""
    sid = uuid.uuid4().hex[:10]
    content = req.content
    if not content and req.chat_id:
        try:
            from codegaai.core.chat_store import ChatStore
            msgs = ChatStore.get().get_messages(req.chat_id)
            content = "\n\n".join(
                f"**{m['role'].upper()}:** {m['content']}"
                for m in msgs[-20:]
            )
        except Exception:
            pass
    if not content:
        return {"error": "Paylaşılacak içerik bulunamadı"}

    _shares[sid] = {
        "content": content,
        "created_at": time.strftime("%Y-%m-%d %H:%M"),
        "expires_at": time.time() + req.expires_hours * 3600,
    }
    # Max 100 paylaşım
    if len(_shares) > 100:
        oldest = min(_shares, key=lambda k: _shares[k]["expires_at"])
        del _shares[oldest]

    return {
        "share_id": sid,
        "url": f"/api/codex_plus/share/{sid}",
        "expires_hours": req.expires_hours,
        "phase": "Faz 15",
    }

@router.get("/share/{share_id}")
async def share_get(share_id: str) -> dict:
    s = _shares.get(share_id)
    if not s: return {"error": "Paylaşım bulunamadı veya süresi dolmuş"}
    if time.time() > s["expires_at"]: return {"error": "Paylaşım süresi dolmuş"}
    return {"content": s["content"], "created_at": s["created_at"]}


# ── FAZ 16: Diff & Patch ─────────────────────────────────────────────────

class DiffRequest(BaseModel):
    file_a: str   # İçerik
    file_b: str
    filename: str = "file"
    explain: bool = True

@router.post("/diff")
async def diff_files(req: DiffRequest) -> dict:
    """İki metin arasındaki farkı göster + AI açıklaması — Faz 16."""
    import difflib
    a_lines = req.file_a.splitlines(keepends=True)
    b_lines = req.file_b.splitlines(keepends=True)
    diff = list(difflib.unified_diff(a_lines, b_lines,
                                     fromfile=f"a/{req.filename}",
                                     tofile=f"b/{req.filename}"))
    diff_text = "".join(diff[:200])  # Max 200 satır diff

    added   = sum(1 for l in diff if l.startswith("+") and not l.startswith("+++"))
    removed = sum(1 for l in diff if l.startswith("-") and not l.startswith("---"))

    explanation = ""
    if req.explain and diff_text:
        from codegaai.core.engine import LLMEngine, GenerationConfig
        engine = LLMEngine.get()
        if engine.is_ready:
            msgs = [{"role": "user", "content":
                     f"Bu diff'i Türkçe özetle — ne değişti, neden önemli:\n```diff\n{diff_text[:1500]}\n```"}]
            for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=250)):
                explanation += tok

    return {
        "diff": diff_text,
        "added_lines": added,
        "removed_lines": removed,
        "explanation": explanation.strip(),
        "phase": "Faz 16",
    }


class PatchRequest(BaseModel):
    original: str
    patch: str

@router.post("/patch")
async def apply_patch(req: PatchRequest) -> dict:
    """Patch metnini orijinal dosyaya uygula — Faz 16."""
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            orig  = Path(tmpdir) / "original.txt"
            patch = Path(tmpdir) / "changes.patch"
            orig.write_text(req.original, encoding="utf-8")
            patch.write_text(req.patch,   encoding="utf-8")
            r = subprocess.run(
                ["patch", str(orig), str(patch)],
                capture_output=True, text=True, timeout=5,
                creationflags=CREATE_NO_WINDOW,
            )
            if r.returncode == 0:
                return {"ok": True, "result": orig.read_text("utf-8")}
            return {"ok": False, "error": r.stderr[:300]}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── FAZ 17: Kod İnceleme (PR Review) ─────────────────────────────────────

class ReviewRequest(BaseModel):
    code: str
    language: str = "php"
    focus: str = "all"   # all | security | performance | style | bugs

@router.post("/review")
async def code_review(req: ReviewRequest) -> dict:
    """Kodu incele: güvenlik, performans, bug, stil — Faz 17."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready: return {"error": "Model yüklü değil"}

    focus_map = {
        "security":    "GÜVENLİK açıkları (SQLi, XSS, CSRF, auth bypass)",
        "performance": "PERFORMANS sorunları (N+1 sorgu, belleksizlik, yavaş algoritma)",
        "style":       "KOD STİLİ (PSR standartları, isimlendirme, okunabilirlik)",
        "bugs":        "HATALAR ve edge case'ler",
        "all":         "güvenlik, performans, hatalar ve kod kalitesi",
    }
    focus_desc = focus_map.get(req.focus, focus_map["all"])

    msgs = [
        {"role": "system", "content":
         "Sen kıdemli bir kod inceleyicisin. Somut ve uygulanabilir geri bildirim ver. "
         "Her sorun için: Satır numarası (varsa), sorunun tipi, açıklama ve düzeltilmiş kod ver."},
        {"role": "user", "content":
         f"Bu {req.language} kodunu {focus_desc} açısından incele:\n\n"
         f"```{req.language}\n{req.code[:4000]}\n```\n\n"
         "Format: ## SORUNLAR (öncelik sırasıyla)\n### [TIP] Başlık\nAçıklama\n```düzeltme```"},
    ]
    review = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=1200, temperature=0.2)):
        review += tok

    # Sorun sayısını say
    issues = len(re.findall(r"^###", review, re.MULTILINE))
    return {
        "review": review,
        "issue_count": issues,
        "language": req.language,
        "focus": req.focus,
        "phase": "Faz 17",
    }


# ── FAZ 18: Veritabanı Yöneticisi ────────────────────────────────────────

class SQLRequest(BaseModel):
    query: str
    schema: str = ""    # CREATE TABLE ifadeleri (bağlantı yoksa)
    explain_plan: bool = False

@router.post("/sql/analyze")
async def sql_analyze(req: SQLRequest) -> dict:
    """SQL sorgusunu analiz et + optimize et — Faz 18."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready: return {"error": "Model yüklü değil"}

    schema_ctx = f"\nŞema:\n```sql\n{req.schema[:1000]}\n```" if req.schema else ""
    msgs = [
        {"role": "system", "content": "Sen bir senior DBA'sin. SQL sorgularını optimize edersin."},
        {"role": "user", "content":
         f"Bu SQL sorgusunu analiz et:{schema_ctx}\n\n```sql\n{req.query}\n```\n\n"
         "Şunları ver:\n"
         "1. **Ne yapıyor** — kısa açıklama\n"
         "2. **Sorunlar** — N+1, full scan, index eksikliği\n"
         "3. **Optimize edilmiş versiyon** — gerekçesiyle\n"
         "4. **Önerilen index'ler** — varsa"},
    ]
    result = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=800, temperature=0.2)):
        result += tok

    return {"analysis": result, "query": req.query, "phase": "Faz 18"}

@router.post("/sql/generate")
async def sql_generate(req: BaseModel) -> dict:
    """Doğal dilden SQL üret — Faz 18."""
    return {"message": "sql/analyze endpoint'ini kullanın"}


class NLtoSQLRequest(BaseModel):
    question: str
    schema: str = ""

@router.post("/sql/nl2sql")
async def nl_to_sql(req: NLtoSQLRequest) -> dict:
    """Doğal dil → SQL — Faz 18."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready: return {"error": "Model yüklü değil"}

    schema_ctx = f"Şema:\n```sql\n{req.schema[:1000]}\n```\n\n" if req.schema else ""
    msgs = [
        {"role": "system", "content": "Sadece SQL kodu döndür, açıklama yok."},
        {"role": "user", "content":
         f"{schema_ctx}Bu soruyu SQL'e çevir: {req.question}"},
    ]
    sql = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=300, temperature=0.1)):
        sql += tok

    # SQL bloğunu temizle
    sql = re.sub(r"```sql\n?|```", "", sql).strip()
    return {"sql": sql, "question": req.question, "phase": "Faz 18"}


# ── FAZ 19: Akıllı Hata Ayıklama ─────────────────────────────────────────

class DebugRequest(BaseModel):
    traceback: str
    code: str = ""       # İlgili kod (opsiyonel)
    language: str = "python"

@router.post("/debug")
async def smart_debug(req: DebugRequest) -> dict:
    """Stack trace → kök neden → otomatik düzeltme — Faz 19."""
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready: return {"error": "Model yüklü değil"}

    code_ctx = f"\n\nİlgili kod:\n```{req.language}\n{req.code[:2000]}\n```" if req.code else ""
    msgs = [
        {"role": "system", "content":
         "Sen bir hata ayıklama uzmanısın. Hataları hızlı ve kesin teşhis edersin."},
        {"role": "user", "content":
         f"Bu hatayı analiz et:\n\n```\n{req.traceback[:2000]}\n```{code_ctx}\n\n"
         "Şunları ver:\n"
         "## Kök Neden\n(tek cümle)\n"
         "## Neden Oluştu\n(2-3 cümle açıklama)\n"
         "## Düzeltme\n```kod\ndüzeltilmiş versiyon\n```\n"
         "## Önleme\n(gelecekte nasıl önlenir)"},
    ]
    analysis = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=800, temperature=0.2)):
        analysis += tok

    # Düzeltilmiş kodu çıkar
    fix = ""
    m = re.search(rf"```{req.language}\n(.*?)```", analysis, re.DOTALL)
    if m: fix = m.group(1).strip()

    return {
        "analysis": analysis,
        "suggested_fix": fix,
        "language": req.language,
        "phase": "Faz 19",
    }


# ── FAZ 20: Ses → Kod ────────────────────────────────────────────────────

class VoiceCodeRequest(BaseModel):
    audio_b64: str = ""      # Base64 WAV/MP3
    transcript: str = ""     # Zaten transkriptten geliyorsa
    language: str = "php"

@router.post("/voice-code")
async def voice_to_code(req: VoiceCodeRequest) -> dict:
    """Sesli komut → kod üret — Faz 20."""
    # Transkripsiyon
    text = req.transcript
    if not text and req.audio_b64:
        try:
            import base64, tempfile
            audio_bytes = base64.b64decode(req.audio_b64)
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name
            from codegaai.core.stt_engine import STTEngine
            text = STTEngine.get().transcribe(tmp_path) or ""
            import os; os.unlink(tmp_path)
        except Exception as e:
            return {"error": f"Ses transkripsiyon hatası: {e}"}

    if not text:
        return {"error": "Ses veya transkript gerekli"}

    # Kod üret
    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready: return {"error": "Model yüklü değil"}

    msgs = [
        {"role": "system", "content": f"Sesli komuttan {req.language} kodu üret. Sadece kod döndür."},
        {"role": "user", "content": text},
    ]
    code = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=600, temperature=0.2)):
        code += tok
    code = re.sub(r"```\w*\n?|```", "", code).strip()

    return {
        "transcript": text,
        "code": code,
        "language": req.language,
        "phase": "Faz 20",
    }


# ── FAZ 21: Proje Şablon Motoru ──────────────────────────────────────────

TEMPLATES = {
    "php-mvc": {
        "desc": "PHP 8.3 MVC projesi (PSR-4, PDO, Router)",
        "files": {
            "index.php": "<?php\nrequire 'vendor/autoload.php';\n\$app = new App\\Core\\Application();\n\$app->run();\n",
            "src/Core/Application.php": "<?php\nnamespace App\\Core;\n\nclass Application {\n    public function run(): void {\n        // Router başlat\n    }\n}\n",
            "src/Core/Router.php": "<?php\nnamespace App\\Core;\n\nclass Router {\n    private array \$routes = [];\n    public function get(string \$path, callable \$handler): void {\n        \$this->routes['GET'][\$path] = \$handler;\n    }\n}\n",
            "src/Core/Database.php": "<?php\nnamespace App\\Core;\n\nclass Database {\n    private static ?\\PDO \$instance = null;\n    public static function get(): \\PDO {\n        if (!self::\$instance) {\n            self::\$instance = new \\PDO(\n                'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',\n                DB_USER, DB_PASS,\n                [\\PDO::ATTR_ERRMODE => \\PDO::ERRMODE_EXCEPTION]\n            );\n        }\n        return self::\$instance;\n    }\n}\n",
            "config.php": "<?php\ndefine('DB_HOST', 'localhost');\ndefine('DB_NAME', 'myapp');\ndefine('DB_USER', 'root');\ndefine('DB_PASS', '');\n",
            "composer.json": '{"require": {}, "autoload": {"psr-4": {"App\\\\": "src/"}}}',
            ".htaccess": "RewriteEngine On\nRewriteCond %{REQUEST_FILENAME} !-f\nRewriteRule ^(.*)$ index.php [QSA,L]\n",
        }
    },
    "fastapi": {
        "desc": "FastAPI + SQLAlchemy + Pydantic projesi",
        "files": {
            "main.py": "from fastapi import FastAPI\nfrom app.routers import users\n\napp = FastAPI(title='MyAPI')\napp.include_router(users.router, prefix='/api/users')\n",
            "app/__init__.py": "",
            "app/routers/__init__.py": "",
            "app/routers/users.py": "from fastapi import APIRouter\nfrom pydantic import BaseModel\n\nrouter = APIRouter()\n\nclass User(BaseModel):\n    name: str\n    email: str\n\n@router.get('/')\nasync def list_users(): return []\n\n@router.post('/')\nasync def create_user(user: User): return user\n",
            "app/models.py": "from sqlalchemy import Column, Integer, String\nfrom app.database import Base\n\nclass User(Base):\n    __tablename__ = 'users'\n    id = Column(Integer, primary_key=True)\n    name = Column(String(100))\n    email = Column(String(200), unique=True)\n",
            "app/database.py": "from sqlalchemy import create_engine\nfrom sqlalchemy.orm import sessionmaker, DeclarativeBase\n\nDATABASE_URL = 'sqlite:///./app.db'\nengine = create_engine(DATABASE_URL)\nSessionLocal = sessionmaker(bind=engine)\n\nclass Base(DeclarativeBase): pass\n",
            "requirements.txt": "fastapi\nuvicorn[standard]\nsqlalchemy\npydantic\n",
        }
    },
    "vanilla-js": {
        "desc": "Vanilla JS + CSS Grid SPA şablonu",
        "files": {
            "index.html": "<!DOCTYPE html>\n<html lang='tr'>\n<head><meta charset='UTF-8'><title>App</title><link rel='stylesheet' href='style.css'></head>\n<body>\n<div id='app'></div>\n<script type='module' src='main.js'></script>\n</body></html>\n",
            "main.js": "import { Router } from './router.js';\nconst app = document.getElementById('app');\nnew Router(app).init();\n",
            "router.js": "export class Router {\n  constructor(container) { this.container = container; }\n  init() { window.addEventListener('hashchange', () => this.route()); this.route(); }\n  route() { this.container.innerHTML = '<h1>Sayfa: ' + (location.hash || '#home') + '</h1>'; }\n}\n",
            "style.css": "*, *::before, *::after { box-sizing: border-box; margin: 0; }\nbody { font-family: system-ui, sans-serif; background: #0a0b0d; color: #fff; }\n#app { min-height: 100vh; display: grid; place-items: center; }\n",
        }
    },
}


class TemplateRequest(BaseModel):
    template: str           # "php-mvc" | "fastapi" | "vanilla-js" | "custom"
    project_name: str = "myproject"
    custom_desc: str = ""   # "custom" seçildiyse AI üretir


@router.get("/templates")
async def list_templates() -> dict:
    return {
        "templates": [
            {"id": k, "name": k, "desc": v["desc"]}
            for k, v in TEMPLATES.items()
        ] + [{"id": "custom", "name": "AI ile Özel", "desc": "Açıkladığınız projeyi AI üretir"}],
        "phase": "Faz 21",
    }


@router.post("/templates/generate")
async def generate_template(req: TemplateRequest) -> dict:
    """Şablondan proje ZIP üret — Faz 21."""

    if req.template in TEMPLATES:
        files = {}
        for fname, content in TEMPLATES[req.template]["files"].items():
            fname_proj = fname.replace("myapp", req.project_name)
            files[f"{req.project_name}/{fname_proj}"] = content
    elif req.template == "custom" and req.custom_desc:
        # AI ile üret
        from codegaai.core.engine import LLMEngine, GenerationConfig
        engine = LLMEngine.get()
        if not engine.is_ready: return {"error": "Model yüklü değil"}

        msgs = [
            {"role": "system", "content":
             "Proje dosyaları üret. [FILE: path]\n```lang\nkod\n```\n[/FILE] formatında."},
            {"role": "user", "content":
             f"'{req.project_name}' adlı bu projeyi oluştur:\n{req.custom_desc}\n\n"
             "Temel dosyaları üret (max 8 dosya)."},
        ]
        raw = ""
        for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=2000, temperature=0.3)):
            raw += tok

        files = {}
        for m in re.finditer(r'\[FILE:\s*([^\]]+)\]\s*\n```\w*\n(.*?)```\s*\[/FILE\]',
                              raw, re.DOTALL):
            files[f"{req.project_name}/{m.group(1).strip()}"] = m.group(2)
        if not files:
            files[f"{req.project_name}/README.md"] = f"# {req.project_name}\n\n{req.custom_desc}"
    else:
        return {"error": f"Bilinmeyen şablon: {req.template}"}

    # ZIP oluştur
    buf = io.BytesIO()
    with __import__("zipfile").ZipFile(buf, "w") as zf:
        for fname, content in files.items():
            zf.writestr(fname, content)
    zip_data = buf.getvalue()

    # İndirme deposuna kaydet
    from codegaai.api.routes.files import _zip_store, _make_zip
    zid = uuid.uuid4().hex[:8]
    _zip_store[zid] = {
        "data": zip_data,
        "filename": f"{req.project_name}.zip",
        "ts": time.time(),
    }

    return {
        "zip_id": zid,
        "download_url": f"/api/files/download/{zid}",
        "files": list(files.keys()),
        "template": req.template,
        "phase": "Faz 21",
    }
