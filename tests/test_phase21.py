"""
Faz 2.1 testleri — kalıcı sohbet (SQLite ChatStore + /api/chats endpoint'leri).

Çalıştırmak için:
    python -m unittest tests.test_phase21
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class TestChatStore(unittest.TestCase):
    """ChatStore'un temel CRUD davranışı."""

    def setUp(self) -> None:
        # Geçici DB - her test izole
        self.tmpdir = tempfile.mkdtemp()
        self.db_path = Path(self.tmpdir) / "test_chats.db"

        from codegaai.core.chat_store import ChatStore
        # Singleton'ı bypass etmek için doğrudan instance
        ChatStore._instance = None
        self.store = ChatStore(self.db_path)

    def tearDown(self) -> None:
        from codegaai.core.chat_store import ChatStore
        ChatStore._instance = None
        # Temp temizle
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_create_chat(self) -> None:
        chat_id = self.store.create_chat()
        self.assertIsInstance(chat_id, int)
        self.assertGreater(chat_id, 0)

    def test_create_with_title(self) -> None:
        chat_id = self.store.create_chat("Özel başlık")
        chat = self.store.get_chat(chat_id)
        self.assertIsNotNone(chat)
        self.assertEqual(chat["title"], "Özel başlık")

    def test_list_chats_empty(self) -> None:
        self.assertEqual(self.store.list_chats(), [])

    def test_list_chats_ordered_by_updated(self) -> None:
        c1 = self.store.create_chat("İlk")
        c2 = self.store.create_chat("İkinci")
        c3 = self.store.create_chat("Üçüncü")
        chats = self.store.list_chats()
        self.assertEqual(len(chats), 3)
        # En son oluşturulan en üstte
        self.assertEqual(chats[0]["id"], c3)

    def test_add_message(self) -> None:
        chat_id = self.store.create_chat()
        msg_id = self.store.add_message(chat_id, "user", "Merhaba")
        self.assertGreater(msg_id, 0)

        messages = self.store.get_messages(chat_id)
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["role"], "user")
        self.assertEqual(messages[0]["content"], "Merhaba")

    def test_invalid_role_rejected(self) -> None:
        chat_id = self.store.create_chat()
        with self.assertRaises(ValueError):
            self.store.add_message(chat_id, "robot", "merhaba")

    def test_auto_title_from_first_user_message(self) -> None:
        chat_id = self.store.create_chat()  # Default: "Yeni sohbet"
        self.store.add_message(chat_id, "user", "Python list nedir?")
        chat = self.store.get_chat(chat_id)
        self.assertEqual(chat["title"], "Python list nedir?")

    def test_auto_title_truncates_long_text(self) -> None:
        chat_id = self.store.create_chat()
        long = "Lorem ipsum dolor sit amet " * 10
        self.store.add_message(chat_id, "user", long)
        chat = self.store.get_chat(chat_id)
        self.assertLessEqual(len(chat["title"]), 70)
        self.assertTrue(chat["title"].endswith("…"))

    def test_user_set_title_not_overwritten(self) -> None:
        chat_id = self.store.create_chat("Özel başlık")
        self.store.add_message(chat_id, "user", "ilk mesaj")
        chat = self.store.get_chat(chat_id)
        self.assertEqual(chat["title"], "Özel başlık")

    def test_rename(self) -> None:
        chat_id = self.store.create_chat()
        ok = self.store.rename_chat(chat_id, "Yeni Başlık")
        self.assertTrue(ok)
        chat = self.store.get_chat(chat_id)
        self.assertEqual(chat["title"], "Yeni Başlık")

    def test_delete_cascades_messages(self) -> None:
        chat_id = self.store.create_chat()
        self.store.add_message(chat_id, "user", "1")
        self.store.add_message(chat_id, "assistant", "2")
        self.assertEqual(self.store.message_count(chat_id), 2)

        self.assertTrue(self.store.delete_chat(chat_id))
        self.assertIsNone(self.store.get_chat(chat_id))
        self.assertEqual(self.store.message_count(chat_id), 0)

    def test_messages_ordered(self) -> None:
        chat_id = self.store.create_chat()
        self.store.add_message(chat_id, "user", "A")
        self.store.add_message(chat_id, "assistant", "B")
        self.store.add_message(chat_id, "user", "C")
        msgs = self.store.get_messages(chat_id)
        self.assertEqual([m["content"] for m in msgs], ["A", "B", "C"])

    def test_get_messages_limit_keeps_chronological_order(self) -> None:
        chat_id = self.store.create_chat()
        for content in ("A", "B", "C", "D"):
            self.store.add_message(chat_id, "user", content)

        msgs = self.store.get_messages(chat_id, limit=2)

        self.assertEqual([m["content"] for m in msgs], ["C", "D"])


class TestChatsApi(unittest.TestCase):
    """API endpoint'lerini TestClient ile çağır."""

    @classmethod
    def setUpClass(cls) -> None:
        # Geçici DB kullan
        import tempfile
        from pathlib import Path
        from codegaai.core.chat_store import ChatStore

        cls.tmpdir = tempfile.mkdtemp()
        cls.db_path = Path(cls.tmpdir) / "api_test.db"

        # Singleton'ı geçici DB ile başlat
        ChatStore._instance = ChatStore(cls.db_path)

        from fastapi.testclient import TestClient
        from codegaai.api.server import app
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        from codegaai.core.chat_store import ChatStore
        ChatStore._instance = None
        import shutil
        shutil.rmtree(cls.tmpdir, ignore_errors=True)

    def test_list_empty(self) -> None:
        r = self.client.get("/api/chats")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("chats", data)

    def test_full_lifecycle(self) -> None:
        # Yeni sohbet
        r = self.client.post("/api/chats", json={"title": "Test"})
        self.assertEqual(r.status_code, 200)
        chat = r.json()["chat"]
        chat_id = chat["id"]
        self.assertEqual(chat["title"], "Test")

        # Sohbete mesaj ekle (dolaylı, /api/chat üzerinden)
        r = self.client.post("/api/chat", json={
            "chat_id": chat_id,
            "messages": [{"role": "user", "content": "Selam"}],
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["chat_id"], chat_id)

        # Mesajları getir — kullanıcı + asistan = 2
        r = self.client.get(f"/api/chats/{chat_id}")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(len(data["messages"]), 2)
        self.assertEqual(data["messages"][0]["role"], "user")
        self.assertEqual(data["messages"][1]["role"], "assistant")

        # Yeniden adlandır
        r = self.client.patch(f"/api/chats/{chat_id}",
                              json={"title": "Yeni"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["chat"]["title"], "Yeni")

        # Sil
        r = self.client.delete(f"/api/chats/{chat_id}")
        self.assertEqual(r.status_code, 200)

        # Artık yok
        r = self.client.get(f"/api/chats/{chat_id}")
        self.assertEqual(r.status_code, 404)

    def test_chat_without_chat_id_works(self) -> None:
        """Stateless mod - chat_id verilmezse de cevap üretmeli."""
        r = self.client.post("/api/chat", json={
            "messages": [{"role": "user", "content": "test"}]
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIsNone(data["chat_id"])

    def test_chat_with_invalid_id_404(self) -> None:
        r = self.client.post("/api/chat", json={
            "chat_id": 999999,
            "messages": [{"role": "user", "content": "test"}]
        })
        self.assertEqual(r.status_code, 404)


class TestUIFiles(unittest.TestCase):
    def test_chats_js_exists(self) -> None:
        from codegaai.api.server import UI_ROOT
        self.assertTrue((UI_ROOT / "js" / "chats.js").exists(),
                        "chats.js eksik")


if __name__ == "__main__":
    unittest.main()
