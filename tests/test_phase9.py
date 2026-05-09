"""Faz 9 testleri - kimlik doğrulama (auth)."""

from __future__ import annotations

import os
import unittest


class TestAuthDisabled(unittest.TestCase):
    """Token boş ise tüm istekler geçer (masaüstü modu)."""

    @classmethod
    def setUpClass(cls) -> None:
        # Token'ı boşalt
        os.environ.pop("CODEGAAI_AUTH__TOKEN", None)

        # Config cache temizle
        import codegaai.config as cfg
        cfg._CACHED_CONFIG = None

        from codegaai.core.engine import LLMEngine
        from codegaai.core.embeddings import EmbeddingService
        from codegaai.core.image_engine import ImageEngine
        from codegaai.core.audio_engine import TTSEngine, ASREngine
        from codegaai.core.video_engine import VideoEngine
        from codegaai.core.learning import (
            FeedbackStore, AdapterManager, TrainingEngine,
        )
        from codegaai.core.updater import Updater
        for c in (LLMEngine, EmbeddingService, ImageEngine,
                  TTSEngine, ASREngine, VideoEngine,
                  FeedbackStore, AdapterManager, TrainingEngine, Updater):
            c._instance = None

        import tempfile
        from pathlib import Path
        from codegaai.core.chat_store import ChatStore
        cls.tmpdir = tempfile.mkdtemp()
        cls.db_path = Path(cls.tmpdir) / "p9_test.db"
        ChatStore._instance = ChatStore(cls.db_path)

        # Server modülü cache'lemiş olabilir; yeniden import
        import importlib
        import codegaai.api.server as server_mod
        importlib.reload(server_mod)

        from fastapi.testclient import TestClient
        cls.client = TestClient(server_mod.create_app())

    @classmethod
    def tearDownClass(cls) -> None:
        from codegaai.core.chat_store import ChatStore
        ChatStore._instance = None
        import shutil
        shutil.rmtree(cls.tmpdir, ignore_errors=True)

    def test_root_accessible_without_token(self) -> None:
        r = self.client.get("/api")
        self.assertEqual(r.status_code, 200)

    def test_status_says_disabled(self) -> None:
        r = self.client.get("/api/auth/status")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertFalse(data["auth_enabled"])
        self.assertTrue(data["is_logged_in"])

    def test_login_page_redirects(self) -> None:
        r = self.client.get("/login", follow_redirects=False)
        # Auth disabled → /'a yönlenir
        self.assertEqual(r.status_code, 302)
        self.assertEqual(r.headers["location"], "/")


class TestAuthEnabled(unittest.TestCase):
    """Token ayarlıysa korumalı endpoint'ler 401 dönmeli."""

    TOKEN = "test_token_abc123_secret_xyz789"

    @classmethod
    def setUpClass(cls) -> None:
        os.environ["CODEGAAI_AUTH__TOKEN"] = cls.TOKEN

        import codegaai.config as cfg
        cfg._CACHED_CONFIG = None

        from codegaai.core.engine import LLMEngine
        from codegaai.core.embeddings import EmbeddingService
        from codegaai.core.image_engine import ImageEngine
        from codegaai.core.audio_engine import TTSEngine, ASREngine
        from codegaai.core.video_engine import VideoEngine
        from codegaai.core.learning import (
            FeedbackStore, AdapterManager, TrainingEngine,
        )
        from codegaai.core.updater import Updater
        for c in (LLMEngine, EmbeddingService, ImageEngine,
                  TTSEngine, ASREngine, VideoEngine,
                  FeedbackStore, AdapterManager, TrainingEngine, Updater):
            c._instance = None

        import tempfile
        from pathlib import Path
        from codegaai.core.chat_store import ChatStore
        cls.tmpdir = tempfile.mkdtemp()
        cls.db_path = Path(cls.tmpdir) / "p9_test.db"
        ChatStore._instance = ChatStore(cls.db_path)

        import importlib
        import codegaai.api.server as server_mod
        importlib.reload(server_mod)

        from fastapi.testclient import TestClient
        cls.client = TestClient(server_mod.create_app())

    @classmethod
    def tearDownClass(cls) -> None:
        from codegaai.core.chat_store import ChatStore
        ChatStore._instance = None
        os.environ.pop("CODEGAAI_AUTH__TOKEN", None)
        import codegaai.config as cfg
        cfg._CACHED_CONFIG = None
        import shutil
        shutil.rmtree(cls.tmpdir, ignore_errors=True)

    def setUp(self) -> None:
        # Her test'te cookie'leri temizle (önceki test'in session'ı sızmasın)
        self.client.cookies.clear()

    def test_status_says_enabled(self) -> None:
        r = self.client.get("/api/auth/status")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertTrue(data["auth_enabled"])
        self.assertFalse(data["is_logged_in"])

    def test_login_page_shows_form(self) -> None:
        r = self.client.get("/login", follow_redirects=False)
        self.assertEqual(r.status_code, 200)
        self.assertIn(b"CODEGA AI", r.content)
        self.assertIn(b"token", r.content)

    def test_protected_endpoint_401_without_token(self) -> None:
        r = self.client.get("/api/system/info", follow_redirects=False)
        self.assertEqual(r.status_code, 401)

    def test_root_redirects_to_login(self) -> None:
        r = self.client.get("/", follow_redirects=False)
        self.assertEqual(r.status_code, 302)
        self.assertIn("/login", r.headers["location"])

    def test_bearer_token_works(self) -> None:
        r = self.client.get(
            "/api/system/info",
            headers={"Authorization": f"Bearer {self.TOKEN}"},
        )
        self.assertEqual(r.status_code, 200)

    def test_bearer_wrong_token_rejected(self) -> None:
        r = self.client.get(
            "/api/system/info",
            headers={"Authorization": "Bearer wrong_token"},
        )
        self.assertEqual(r.status_code, 401)

    def test_login_endpoint_sets_cookie(self) -> None:
        r = self.client.post(
            "/api/auth/login",
            json={"token": self.TOKEN},
        )
        self.assertEqual(r.status_code, 200)
        self.assertIn("codegaai_session", r.cookies)
        self.assertEqual(r.cookies["codegaai_session"], self.TOKEN)

    def test_login_wrong_token_401(self) -> None:
        r = self.client.post(
            "/api/auth/login",
            json={"token": "wrong"},
        )
        self.assertEqual(r.status_code, 401)

    def test_cookie_session_works(self) -> None:
        # Login al
        self.client.post(
            "/api/auth/login",
            json={"token": self.TOKEN},
        )
        # Sonra cookie ile erişim
        r = self.client.get("/api/system/info")
        self.assertEqual(r.status_code, 200)

    def test_logout_clears_cookie(self) -> None:
        self.client.post("/api/auth/login", json={"token": self.TOKEN})
        r = self.client.post("/api/auth/logout")
        self.assertEqual(r.status_code, 200)

    def test_public_paths_no_auth(self) -> None:
        # /api root
        self.assertEqual(self.client.get("/api").status_code, 200)
        # /api/auth/status
        self.assertEqual(self.client.get("/api/auth/status").status_code, 200)
        # docs
        self.assertEqual(self.client.get("/api/docs").status_code, 200)


if __name__ == "__main__":
    unittest.main()
