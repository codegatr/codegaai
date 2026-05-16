"""
codegaai.core.session_log
===========================

Her geliştirme oturumunu ve değişikliği kaydeden sistem.
Bir sonraki oturumda "ne yaptık, neredeyiz" bilgisini buradan al.

Kayıt yeri: DATA_DIR/session_log/
  current_session.json   → aktif oturum
  history/               → geçmiş oturumlar (tarih.json)
  CHANGES.md             → tüm değişikliklerin MD özeti
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from codegaai.config import DATA_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)

SESSION_DIR      = DATA_DIR / "session_log"
CURRENT_FILE     = SESSION_DIR / "current_session.json"
HISTORY_DIR      = SESSION_DIR / "history"
CHANGES_MD       = SESSION_DIR / "CHANGES.md"


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def _today() -> str:
    return time.strftime("%Y-%m-%d")


class SessionLog:
    """Geliştirme oturumu kayıt sistemi. Singleton."""

    _instance: "SessionLog | None" = None

    @classmethod
    def get(cls) -> "SessionLog":
        if not cls._instance:
            cls._instance = cls()
        return cls._instance

    def __init__(self) -> None:
        SESSION_DIR.mkdir(parents=True, exist_ok=True)
        HISTORY_DIR.mkdir(parents=True, exist_ok=True)
        self._session = self._load_or_create()

    # ── Yükleme / Oluşturma ──────────────────────────────────────────────

    def _load_or_create(self) -> dict:
        if CURRENT_FILE.exists():
            try:
                data = json.loads(CURRENT_FILE.read_text("utf-8"))
                log.info("Oturum yüklendi: %s", data.get("session_id", "?"))
                return data
            except Exception:
                pass
        return self._new_session()

    def _new_session(self) -> dict:
        from codegaai import __version__
        session = {
            "session_id": time.strftime("%Y%m%d_%H%M%S"),
            "started_at": _now(),
            "version":    __version__,
            "changes":    [],
            "phases_worked": [],
            "bugs_fixed": [],
            "summary": "",
        }
        self._save(session)
        return session

    def _save(self, data: dict | None = None) -> None:
        obj = data or self._session
        CURRENT_FILE.write_text(
            json.dumps(obj, ensure_ascii=False, indent=2), "utf-8"
        )

    # ── Kayıt API'si ─────────────────────────────────────────────────────

    def log_change(self,
                   category: str,
                   title: str,
                   detail: str = "",
                   files: list[str] | None = None) -> None:
        """Değişiklik kaydet."""
        entry = {
            "ts": _now(),
            "category": category,   # feature|fix|refactor|ui|perf|security
            "title": title,
            "detail": detail,
            "files": files or [],
        }
        self._session["changes"].append(entry)
        self._save()
        self._append_md(entry)
        log.debug("Session log: [%s] %s", category, title)

    def log_phase(self, phase_num: int, name: str) -> None:
        entry = f"Faz {phase_num}: {name}"
        if entry not in self._session["phases_worked"]:
            self._session["phases_worked"].append(entry)
            self._save()

    def log_fix(self, bug: str, solution: str) -> None:
        self._session["bugs_fixed"].append({
            "ts": _now(), "bug": bug, "solution": solution
        })
        self._save()

    def set_summary(self, summary: str) -> None:
        self._session["summary"] = summary
        self._save()

    # ── Oturum Kapatma ───────────────────────────────────────────────────

    def close_session(self, summary: str = "") -> str:
        """Oturumu kapat, geçmişe arşivle."""
        if summary:
            self._session["summary"] = summary
        self._session["closed_at"] = _now()

        # Geçmiş dosyasına yaz
        hist_file = HISTORY_DIR / f"{self._session['session_id']}.json"
        hist_file.write_text(
            json.dumps(self._session, ensure_ascii=False, indent=2), "utf-8"
        )

        # Yeni oturum oluştur
        sid = self._session["session_id"]
        self._session = self._new_session()
        log.info("Oturum kapatıldı: %s", sid)
        return sid

    # ── Özet / Rapor ─────────────────────────────────────────────────────

    def current_summary(self) -> dict:
        s = self._session
        return {
            "session_id":     s["session_id"],
            "started_at":     s["started_at"],
            "version":        s.get("version", "?"),
            "change_count":   len(s["changes"]),
            "phases_worked":  s["phases_worked"],
            "bugs_fixed":     len(s["bugs_fixed"]),
            "summary":        s.get("summary", ""),
            "last_changes":   s["changes"][-5:],
        }

    def history(self, limit: int = 10) -> list[dict]:
        sessions = []
        for f in sorted(HISTORY_DIR.glob("*.json"),
                         key=lambda x: x.stat().st_mtime, reverse=True)[:limit]:
            try:
                data = json.loads(f.read_text("utf-8"))
                sessions.append({
                    "session_id": data.get("session_id"),
                    "started_at": data.get("started_at"),
                    "closed_at":  data.get("closed_at"),
                    "version":    data.get("version"),
                    "changes":    len(data.get("changes", [])),
                    "summary":    data.get("summary", ""),
                    "phases":     data.get("phases_worked", []),
                })
            except Exception:
                pass
        return sessions

    def _append_md(self, entry: dict) -> None:
        """CHANGES.md'ye satır ekle."""
        try:
            line = (f"\n- **[{entry['category'].upper()}]** "
                    f"{entry['ts'][:10]} — {entry['title']}"
                    + (f"\n  {entry['detail']}" if entry['detail'] else "")
                    + (f"\n  `{'`, `'.join(entry['files'])}`" if entry['files'] else ""))
            with CHANGES_MD.open("a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass

    def generate_markdown_report(self) -> str:
        """Mevcut oturumun tam MD raporunu üret."""
        s = self._session
        from codegaai import __version__
        lines = [
            f"# CODEGA AI — Oturum Raporu",
            f"**Sürüm:** v{__version__}",
            f"**Başlangıç:** {s['started_at']}",
            f"**Toplam Değişiklik:** {len(s['changes'])}",
            "",
        ]
        if s.get("summary"):
            lines += [f"## Özet\n{s['summary']}\n"]

        if s["phases_worked"]:
            lines += ["## Çalışılan Fazlar"]
            lines += [f"- {p}" for p in s["phases_worked"]]
            lines.append("")

        if s["bugs_fixed"]:
            lines += ["## Düzeltilen Hatalar"]
            for b in s["bugs_fixed"]:
                lines.append(f"- **{b['bug']}** → {b['solution']}")
            lines.append("")

        if s["changes"]:
            lines += ["## Değişiklikler"]
            for cat in ["feature", "fix", "ui", "perf", "security", "refactor"]:
                cat_changes = [c for c in s["changes"] if c["category"] == cat]
                if cat_changes:
                    lines.append(f"\n### {cat.upper()}")
                    for c in cat_changes:
                        lines.append(f"- {c['title']}"
                                     + (f": {c['detail']}" if c['detail'] else ""))

        return "\n".join(lines)
