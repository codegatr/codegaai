"""
codegaai.api.routes.search
===========================

Faz 55: Akıllı Arama — chat, dosya, not, kod, proje, tüm kaynaklarda ara.

Endpoint:
- GET /api/search?q=...&sources=...&limit=...
"""

from fastapi import APIRouter
from typing import Optional

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.get("")
async def unified_search(
    q: str,
    sources: str = "all",  # all, chats, files, knowledge, code, projects
    limit: int = 20,
) -> dict:
    """Tüm kaynaklarda birleşik arama."""
    results = {
        "query": q,
        "chats": [],
        "files": [],
        "knowledge": [],
        "code": [],
        "projects": [],
    }

    source_list = sources.split(",") if sources != "all" else [
        "chats", "knowledge", "files", "code", "projects"
    ]

    try:
        # 1. Chat geçmişinde ara
        if "chats" in source_list:
            results["chats"] = await _search_chats(q, limit)

        # 2. Bilgi tabanında ara
        if "knowledge" in source_list:
            results["knowledge"] = await _search_knowledge(q, limit)

        # 3. Yüklenen dosyalarda ara
        if "files" in source_list:
            results["files"] = await _search_files(q, limit)

        # 4. Kod dosyalarında ara
        if "code" in source_list:
            results["code"] = await _search_code(q, limit)

        # 5. Projelerde ara
        if "projects" in source_list:
            results["projects"] = await _search_projects(q, limit)

        # Toplam sonuç sayısı
        results["total"] = sum(len(v) for k, v in results.items() if k != "query")

        return results

    except Exception as e:
        log.error("Arama hatası: %s", e)
        return {"error": str(e), **results}


async def _search_chats(q: str, limit: int) -> list[dict]:
    """Chat geçmişinde ara."""
    try:
        from codegaai.core.chat_store import ChatStore
        store = ChatStore.open()
        # Son 100 mesaj içinde ara
        all_msgs = store.list_messages(limit=100)
        q_lower = q.lower()
        matches = [
            {
                "type": "chat",
                "id": m.id,
                "content": m.content[:150] + "..." if len(m.content) > 150 else m.content,
                "role": m.role,
                "timestamp": m.timestamp,
            }
            for m in all_msgs
            if q_lower in m.content.lower()
        ]
        return matches[:limit]
    except Exception:
        return []


async def _search_knowledge(q: str, limit: int) -> list[dict]:
    """Bilgi tabanında ara."""
    try:
        from codegaai.api.routes import knowledge
        result = await knowledge.search(q, limit)
        return [
            {
                "type": "knowledge",
                "id": r["id"],
                "title": r["title"],
                "content": r["content"],
                "score": r.get("score", 0),
            }
            for r in result.get("results", [])
        ]
    except Exception:
        return []


async def _search_files(q: str, limit: int) -> list[dict]:
    """Yüklenen dosyalarda ara (basit metin araması)."""
    try:
        from codegaai.config import DATA_DIR
        files_dir = DATA_DIR / "uploads"
        if not files_dir.exists():
            return []

        matches = []
        q_lower = q.lower()
        for f in files_dir.rglob("*.txt"):
            try:
                content = f.read_text("utf-8", errors="ignore")
                if q_lower in content.lower():
                    matches.append({
                        "type": "file",
                        "name": f.name,
                        "path": str(f.relative_to(DATA_DIR)),
                        "preview": content[:150] + "...",
                    })
                    if len(matches) >= limit:
                        break
            except Exception:
                continue
        return matches
    except Exception:
        return []


async def _search_code(q: str, limit: int) -> list[dict]:
    """Kod dosyalarında ara (Python/JS/PHP)."""
    try:
        from codegaai.config import DATA_DIR
        code_dir = DATA_DIR / "workspace"
        if not code_dir.exists():
            return []

        matches = []
        q_lower = q.lower()
        for ext in ["*.py", "*.js", "*.php", "*.ts"]:
            for f in code_dir.rglob(ext):
                try:
                    content = f.read_text("utf-8", errors="ignore")
                    if q_lower in content.lower():
                        # Eşleşen satırı bul
                        lines = content.splitlines()
                        matched_line = next((ln for ln in lines if q_lower in ln.lower()), "")
                        matches.append({
                            "type": "code",
                            "file": f.name,
                            "path": str(f.relative_to(DATA_DIR)),
                            "line": matched_line.strip()[:100],
                        })
                        if len(matches) >= limit:
                            return matches
                except Exception:
                    continue
        return matches
    except Exception:
        return []


async def _search_projects(q: str, limit: int) -> list[dict]:
    """Projelerde ara."""
    try:
        from codegaai.core.project_manager import ProjectManager
        pm = ProjectManager.get()
        all_projects = pm.list_projects()
        q_lower = q.lower()
        matches = [
            {
                "type": "project",
                "id": p["id"],
                "name": p["name"],
                "description": p.get("description", ""),
                "status": p.get("status", ""),
            }
            for p in all_projects
            if q_lower in p["name"].lower() or q_lower in p.get("description", "").lower()
        ]
        return matches[:limit]
    except Exception:
        return []
