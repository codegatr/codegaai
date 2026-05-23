"""
codegaai.api.routes.codebase
==============================

Faz 33 — Kod Tabanı Anlama (CODEX'ten üstün)

CODEX: Tek dosya analizi
CODEGA: Tüm proje taranır, bağımlılık grafiği çıkar,
         refactor önerisi, teknik borç analizi, mimari harita

POST /api/codebase/analyze   — Proje ZIP yükle, tüm kodu analiz et
POST /api/codebase/ask       — "Bu projedeki auth sistemi nasıl çalışıyor?"
GET  /api/codebase/map       — Mimari harita (dosya→sınıf→metod)
POST /api/codebase/refactor  — Refactor önerisi üret
POST /api/codebase/debt      — Teknik borç raporu
POST /api/codebase/docs      — Otomatik dokümantasyon üret
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()

# Aktif proje deposu (bellekte)
_projects: dict[str, dict] = {}

TEXT_EXTS = {".php", ".py", ".js", ".ts", ".html", ".css", ".sql",
             ".json", ".yaml", ".yml", ".md", ".txt", ".sh", ".env",
             ".htaccess", ".xml", ".vue", ".jsx", ".tsx"}


def _extract_project(content: bytes, name: str) -> dict:
    """ZIP'ten proje dosyalarını çıkar ve analiz et."""
    files = {}
    structure = {}

    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        for item in zf.namelist():
            ext = Path(item).suffix.lower()
            if ext in TEXT_EXTS and not item.endswith("/"):
                try:
                    text = zf.read(item).decode("utf-8", errors="replace")
                    files[item] = text
                    # Yapı analizi
                    parts = item.split("/")
                    node = structure
                    for p in parts[:-1]:
                        node = node.setdefault(p, {})
                    node[parts[-1]] = len(text)
                except Exception:
                    pass

    # Metrikler
    total_lines = sum(len(c.splitlines()) for c in files.values())
    lang_counts: dict[str, int] = {}
    for fname in files:
        ext = Path(fname).suffix.lower()[1:] or "other"
        lang_counts[ext] = lang_counts.get(ext, 0) + 1

    return {
        "name": name,
        "files": files,
        "structure": structure,
        "metrics": {
            "total_files": len(files),
            "total_lines": total_lines,
            "languages": lang_counts,
        }
    }


def _build_context(project: dict, max_chars: int = 12000) -> str:
    """Proje dosyalarından AI bağlamı oluştur."""
    parts = []
    total = 0
    # Önemli dosyalar önce
    priority = ["index.php", "config.php", "routes.php", "app.py",
                "main.py", "README.md", "package.json", "composer.json"]

    files = project["files"]
    ordered = (
        [(k, v) for k, v in files.items() if any(p in k for p in priority)] +
        [(k, v) for k, v in files.items() if not any(p in k for p in priority)]
    )

    for fname, content in ordered:
        if total > max_chars:
            parts.append(f"\n[... {len(files)} dosyadan bazıları atlandı ...]")
            break
        snippet = content[:2000]
        ext = Path(fname).suffix[1:] or "text"
        part = f"\n### {fname}\n```{ext}\n{snippet}\n```"
        parts.append(part)
        total += len(part)

    return "\n".join(parts)


# ── API ──────────────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze_project(file: UploadFile = File(...)) -> dict:
    """Proje ZIP'ini yükle ve analiz et."""
    content = await file.read()
    name = Path(file.filename or "project").stem

    try:
        project = _extract_project(content, name)
    except zipfile.BadZipFile:
        return {"error": "Geçersiz ZIP"}

    _projects[name] = project
    # Max 5 proje tut
    if len(_projects) > 5:
        oldest = list(_projects.keys())[0]
        del _projects[oldest]

    log.info("Proje analiz edildi: %s (%d dosya)", name, len(project["files"]))
    return {
        "project_id": name,
        "metrics": project["metrics"],
        "structure": project["structure"],
        "message": f"{len(project['files'])} dosya yüklendi. Şimdi soru sorabilirsiniz.",
    }


class AskRequest(BaseModel):
    project_id: str
    question: str


@router.post("/ask")
async def ask_about_codebase(req: AskRequest) -> dict:
    """Proje hakkında soru sor."""
    project = _projects.get(req.project_id)
    if not project:
        return {"error": "Proje bulunamadı. Önce /analyze ile yükleyin."}

    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    context = _build_context(project)
    msgs = [
        {"role": "system", "content":
         f"Sen bir kıdemli yazılım mimarısın. {project['name']} projesini analiz ediyorsun.\n"
         f"Proje: {project['metrics']['total_files']} dosya, "
         f"{project['metrics']['total_lines']} satır\n"
         f"Diller: {', '.join(f'{k}:{v}' for k, v in project['metrics']['languages'].items())}\n"
         f"\nProje dosyaları:\n{context}"},
        {"role": "user", "content": req.question},
    ]
    answer = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=800, temperature=0.3)):
        answer += tok
    return {"answer": answer, "project_id": req.project_id}


class RefactorRequest(BaseModel):
    project_id: str
    file_path: str   # Hangi dosyayı refactor et
    goal: str = "Okunabilirlik ve performans"


@router.post("/refactor")
async def suggest_refactor(req: RefactorRequest) -> dict:
    """Belirli bir dosya için refactor önerisi üret."""
    project = _projects.get(req.project_id)
    if not project:
        return {"error": "Proje bulunamadı"}

    file_content = project["files"].get(req.file_path, "")
    if not file_content:
        # Kısmi eşleşme dene
        matches = [k for k in project["files"] if req.file_path in k]
        if matches:
            file_content = project["files"][matches[0]]
            req.file_path = matches[0]
        else:
            return {"error": f"Dosya bulunamadı: {req.file_path}"}

    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    ext = Path(req.file_path).suffix[1:]
    msgs = [
        {"role": "system", "content": "Sen bir refactoring uzmanısın. Somut kod önerisi ver."},
        {"role": "user", "content":
         f"Bu {ext} dosyasını refactor et. Hedef: {req.goal}\n\n"
         f"```{ext}\n{file_content[:4000]}\n```\n\n"
         "Refactor edilmiş versiyonu [FILE: dosya.ext] formatında ver."},
    ]
    result = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=1500, temperature=0.2)):
        result += tok
    return {"suggestion": result, "file": req.file_path}


class DebtRequest(BaseModel):
    project_id: str


@router.post("/debt")
async def technical_debt_report(req: DebtRequest) -> dict:
    """Teknik borç raporu üret."""
    project = _projects.get(req.project_id)
    if not project:
        return {"error": "Proje bulunamadı"}

    from codegaai.core.engine import LLMEngine, GenerationConfig
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    # Basit metrik analizi (LLM olmadan)
    issues = []
    for fname, content in project["files"].items():
        lines = content.splitlines()
        # Uzun satırlar
        long_lines = sum(1 for l in lines if len(l) > 120)
        if long_lines > 10:
            issues.append(f"{fname}: {long_lines} uzun satır (>120 karakter)")
        # TODO/FIXME
        todos = sum(1 for l in lines if "TODO" in l or "FIXME" in l or "HACK" in l)
        if todos:
            issues.append(f"{fname}: {todos} adet TODO/FIXME")
        # Çok büyük dosya
        if len(lines) > 500:
            issues.append(f"{fname}: {len(lines)} satır (büyük dosya, böl)")

    context = _build_context(project, max_chars=6000)
    msgs = [
        {"role": "system", "content": "Sen bir yazılım kalite uzmanısın."},
        {"role": "user", "content":
         f"Bu projenin teknik borç raporunu Türkçe yaz:\n{context}\n\n"
         "Şunları analiz et: Kod tekrarı, güvenlik açıkları, performans sorunları, "
         "mimari eksiklikler, test eksikliği. Öncelik sıralaması yap."},
    ]
    report = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=1000, temperature=0.3)):
        report += tok
    return {
        "report": report,
        "quick_issues": issues[:15],
        "file_count": len(project["files"]),
    }


class DocsRequest(BaseModel):
    project_id: str
    format: str = "markdown"   # markdown | phpdoc | jsdoc


@router.post("/docs")
async def generate_docs(req: DocsRequest) -> dict:
    """Proje için otomatik dokümantasyon üret."""
    project = _projects.get(req.project_id)
    if not project:
        return {"error": "Proje bulunamadı"}

    from codegaai.core.engine import LLMEngine, GenerationConfig
    from codegaai.api.routes.files import _make_zip
    engine = LLMEngine.get()
    if not engine.is_ready:
        return {"error": "Model yüklü değil"}

    context = _build_context(project, max_chars=8000)
    msgs = [
        {"role": "system", "content": "Sen teknik dokümantasyon uzmanısın."},
        {"role": "user", "content":
         f"Bu proje için kapsamlı {req.format} dokümantasyonu yaz:\n{context}\n\n"
         "Şunları dahil et: Genel bakış, kurulum, API referansı, "
         "kullanım örnekleri, mimari açıklama.\n"
         "[FILE: README.md]\n```markdown\n# Dokümantasyon\n```\n[/FILE]"},
    ]
    doc = ""
    for tok in engine.stream(msgs, cfg=GenerationConfig(max_tokens=1500, temperature=0.3)):
        doc += tok

    # ZIP olarak hazırla
    import re as _re, uuid, time as _t
    from codegaai.api.routes.files import _zip_store
    files = {}
    for m in _re.finditer(r'\[FILE:\s*([^\]]+)\]\s*\n(.*?)\[/FILE\]', doc, _re.DOTALL):
        fname = m.group(1).strip()
        content = _re.sub(r'^```\w*\n?', '', m.group(2).strip())
        content = _re.sub(r'\n?```$', '', content)
        files[fname] = content
    if not files:
        files = {"README.md": doc}

    data = _make_zip(project["name"] + "_docs", files)
    zid = str(uuid.uuid4())[:8]
    _zip_store[zid] = {"data": data, "filename": f"{project['name']}_docs.zip",
                       "ts": _t.time()}

    return {
        "zip_id": zid,
        "download_url": f"/api/files/download/{zid}",
        "files": list(files.keys()),
        "preview": doc[:1000],
    }


@router.get("/projects")
async def list_projects() -> dict:
    return {
        "projects": [
            {
                "id": pid,
                "name": p["name"],
                "files": p["metrics"]["total_files"],
                "lines": p["metrics"]["total_lines"],
            }
            for pid, p in _projects.items()
        ]
    }


# ── Agentic Core v1: local indexing + context packs ─────────────────────

class IndexLocalRequest(BaseModel):
    root: str
    project_id: str = "local"


_local_indexes: dict[str, object] = {}


@router.post("/index-local")
async def index_local_project(req: IndexLocalRequest) -> dict:
    """Yerel proje klasörünü .codegaaiignore kurallarıyla indeksle."""
    from codegaai.core.code_indexer import CodeIndexer

    index = CodeIndexer(req.root).build()
    _local_indexes[req.project_id] = index
    return {
        "project_id": req.project_id,
        "root": index.root,
        "file_count": index.file_count,
        "chunk_count": len(index.chunks),
        "graph_count": len(index.graphs),
    }


class CodeSearchRequest(BaseModel):
    project_id: str = "local"
    query: str
    max_chunks: int = 5


@router.post("/search")
async def search_local_code(req: CodeSearchRequest) -> dict:
    """İndekslenmiş yerel kodda alakalı chunk ara."""
    index = _local_indexes.get(req.project_id)
    if not index:
        return {"error": "Index bulunamadı. Önce /index-local çalıştırın."}
    chunks = index.search(req.query, max_chunks=max(1, min(req.max_chunks, 20)))
    return {"project_id": req.project_id, "results": [c.__dict__ for c in chunks]}


@router.post("/context-pack")
async def build_context_pack(req: CodeSearchRequest) -> dict:
    """Soruya göre modele verilecek kompakt context-pack üret."""
    index = _local_indexes.get(req.project_id)
    if not index:
        return {"error": "Index bulunamadı. Önce /index-local çalıştırın."}
    return {
        "project_id": req.project_id,
        **index.context_pack(req.query, max_chunks=max(1, min(req.max_chunks, 20))),
    }


@router.get("/graph/{project_id}")
async def local_code_graph(project_id: str) -> dict:
    """İndekslenmiş projenin AST grafiğini döndür."""
    index = _local_indexes.get(project_id)
    if not index:
        return {"error": "Index bulunamadı. Önce /index-local çalıştırın."}
    return {"project_id": project_id, "graphs": index.graphs}
