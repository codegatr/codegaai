"""
codegaai.core.chat_store
=========================

SQLite tabanlı kalıcı sohbet saklama.

Her sohbet ve mesajı yerel SQLite veritabanında tutar
(`data/memory/chats.db`). Faz 3'te eklenecek RAG belleği bunun
üstünde inşa edilecek — şimdiden temel atılıyor.

Kullanım:

    store = ChatStore.open()
    chat_id = store.create_chat()
    store.add_message(chat_id, "user", "Merhaba")
    store.add_message(chat_id, "assistant", "Selam!")
    chats = store.list_chats()
    msgs = store.get_messages(chat_id)
"""

from __future__ import annotations

import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from codegaai.config import MEMORY_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)


# ============================================================
# Şema (idempotent — her açılışta CREATE IF NOT EXISTS)
# ============================================================

_SCHEMA = """
CREATE TABLE IF NOT EXISTS chats (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL DEFAULT 'Yeni sohbet',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    archived    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id     INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
    content     TEXT NOT NULL,
    model       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);
CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at DESC);
"""


# ============================================================
# Store
# ============================================================

class ChatStore:
    """SQLite tabanlı thread-safe sohbet deposu."""

    _instance: Optional["ChatStore"] = None
    _lock = threading.Lock()

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._init_schema()

    # ---- bağlantı ----

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(
            self.db_path,
            isolation_level=None,            # autocommit
            check_same_thread=False,
            timeout=10.0,
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    def _init_schema(self) -> None:
        with self._lock:
            conn = self._connect()
            try:
                conn.executescript(_SCHEMA)
            finally:
                conn.close()

    # ---- singleton ----

    @classmethod
    def open(cls) -> "ChatStore":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls(MEMORY_DIR / "chats.db")
                    log.info("ChatStore açıldı: %s", cls._instance.db_path)
        return cls._instance

    # ---- chats CRUD ----

    def create_chat(self, title: str = "Yeni sohbet") -> int:
        with self._lock:
            conn = self._connect()
            try:
                cur = conn.execute(
                    "INSERT INTO chats (title) VALUES (?)", (title,)
                )
                return int(cur.lastrowid)
            finally:
                conn.close()

    def list_chats(self, include_archived: bool = False) -> list[dict[str, Any]]:
        with self._lock:
            conn = self._connect()
            try:
                where = "" if include_archived else "WHERE archived = 0"
                rows = conn.execute(f"""
                    SELECT c.id, c.title, c.created_at, c.updated_at,
                           c.archived,
                           (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id) AS message_count,
                           (SELECT content FROM messages m WHERE m.chat_id = c.id
                            ORDER BY m.id DESC LIMIT 1) AS last_message
                    FROM chats c
                    {where}
                    ORDER BY c.updated_at DESC, c.id DESC
                """).fetchall()
                return [dict(r) for r in rows]
            finally:
                conn.close()

    def get_chat(self, chat_id: int) -> dict[str, Any] | None:
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT * FROM chats WHERE id = ?", (chat_id,)
                ).fetchone()
                return dict(row) if row else None
            finally:
                conn.close()

    def rename_chat(self, chat_id: int, title: str) -> bool:
        with self._lock:
            conn = self._connect()
            try:
                cur = conn.execute(
                    """UPDATE chats SET title = ?, updated_at = datetime('now')
                       WHERE id = ?""",
                    (title, chat_id),
                )
                return cur.rowcount > 0
            finally:
                conn.close()

    def delete_chat(self, chat_id: int) -> bool:
        with self._lock:
            conn = self._connect()
            try:
                cur = conn.execute("DELETE FROM chats WHERE id = ?", (chat_id,))
                return cur.rowcount > 0
            finally:
                conn.close()

    # ---- messages ----

    def add_message(self, chat_id: int, role: str, content: str,
                    model: str | None = None) -> int:
        if role not in ("user", "assistant", "system"):
            raise ValueError(f"Geçersiz rol: {role}")

        with self._lock:
            conn = self._connect()
            try:
                cur = conn.execute(
                    """INSERT INTO messages (chat_id, role, content, model)
                       VALUES (?, ?, ?, ?)""",
                    (chat_id, role, content, model),
                )
                msg_id = int(cur.lastrowid)

                # Sohbeti güncel olarak işaretle
                conn.execute(
                    """UPDATE chats SET updated_at = datetime('now')
                       WHERE id = ?""",
                    (chat_id,),
                )

                # İlk kullanıcı mesajı varsa ve başlık hâlâ varsayılansa,
                # başlığı içerikten otomatik üret
                if role == "user":
                    chat = conn.execute(
                        "SELECT title FROM chats WHERE id = ?", (chat_id,)
                    ).fetchone()
                    if chat and chat["title"] == "Yeni sohbet":
                        new_title = self._auto_title(content)
                        conn.execute(
                            "UPDATE chats SET title = ? WHERE id = ?",
                            (new_title, chat_id),
                        )

                return msg_id
            finally:
                conn.close()

    def get_messages(self, chat_id: int) -> list[dict[str, Any]]:
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """SELECT id, role, content, model, created_at
                       FROM messages WHERE chat_id = ?
                       ORDER BY id ASC""",
                    (chat_id,),
                ).fetchall()
                return [dict(r) for r in rows]
            finally:
                conn.close()

    def message_count(self, chat_id: int | None = None) -> int:
        with self._lock:
            conn = self._connect()
            try:
                if chat_id is None:
                    row = conn.execute(
                        "SELECT COUNT(*) AS c FROM messages"
                    ).fetchone()
                else:
                    row = conn.execute(
                        "SELECT COUNT(*) AS c FROM messages WHERE chat_id = ?",
                        (chat_id,),
                    ).fetchone()
                return int(row["c"]) if row else 0
            finally:
                conn.close()

    # ---- yardımcılar ----

    @staticmethod
    def _auto_title(content: str, max_len: int = 60) -> str:
        """İlk kullanıcı mesajından kısa başlık üret."""
        text = " ".join(content.strip().split())
        if len(text) <= max_len:
            return text
        # Cümle sınırında kes
        cut = text[:max_len]
        last_space = cut.rfind(" ")
        if last_space > max_len * 0.6:
            cut = cut[:last_space]
        return cut + "…"

    def stats(self) -> dict[str, Any]:
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute("""
                    SELECT
                        (SELECT COUNT(*) FROM chats WHERE archived = 0) AS chat_count,
                        (SELECT COUNT(*) FROM messages) AS message_count,
                        (SELECT created_at FROM chats ORDER BY id ASC LIMIT 1) AS first_chat
                """).fetchone()
                return dict(row) if row else {}
            finally:
                conn.close()
