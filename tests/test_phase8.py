"""Faz 8 testleri - akıllı güncelleme (updater core + API)."""

from __future__ import annotations

import unittest


class TestVersionParsing(unittest.TestCase):

    def test_parse_version_basic(self) -> None:
        from codegaai.core.updater import parse_version
        self.assertEqual(parse_version("0.7.0"), (0, 7, 0))
        self.assertEqual(parse_version("v0.7.0"), (0, 7, 0))
        self.assertEqual(parse_version(" v1.2.3 "), (1, 2, 3))

    def test_parse_version_partial(self) -> None:
        from codegaai.core.updater import parse_version
        self.assertEqual(parse_version("v1.0"), (1, 0))
        self.assertEqual(parse_version("2"), (2,))

    def test_parse_version_with_prerelease(self) -> None:
        from codegaai.core.updater import parse_version
        self.assertEqual(parse_version("0.7.0rc1"), (0, 7, 0))

    def test_is_newer(self) -> None:
        from codegaai.core.updater import is_newer
        self.assertTrue(is_newer("0.8.0", "0.7.0"))
        self.assertTrue(is_newer("v0.8.0", "0.7.5"))
        self.assertFalse(is_newer("0.7.0", "0.7.0"))
        self.assertFalse(is_newer("0.6.9", "0.7.0"))
        self.assertTrue(is_newer("1.0.0", "0.99.99"))


class TestAssetPattern(unittest.TestCase):

    def test_asset_pattern_matches(self) -> None:
        from codegaai.core.updater import ASSET_PATTERN, MACOS_ASSET_PATTERN
        self.assertTrue(ASSET_PATTERN.match("codegaai-v0.7.0-windows-cpu.zip"))
        self.assertTrue(ASSET_PATTERN.match("codegaai-v1.0.0-windows-cuda.zip"))
        self.assertTrue(MACOS_ASSET_PATTERN.match("codegaai-v4.5.5-macos-arm64.dmg"))
        self.assertFalse(ASSET_PATTERN.match("source.tar.gz"))
        self.assertFalse(ASSET_PATTERN.match("codegaai-v0.7.0-linux.tar.gz"))


class TestUpdater(unittest.TestCase):

    def test_singleton(self) -> None:
        from codegaai.core.updater import Updater
        Updater._instance = None
        a = Updater.get()
        b = Updater.get()
        self.assertIs(a, b)

    def test_initial_status(self) -> None:
        from codegaai.core.updater import Updater
        Updater._instance = None
        upd = Updater.get()
        s = upd.status
        self.assertEqual(s["state"], "idle")
        self.assertIn("current_version", s)
        self.assertIn("frozen_mode", s)

    def test_is_frozen_default_false_in_test(self) -> None:
        """Test ortamında sys.frozen yok → False."""
        from codegaai.core.updater import Updater
        self.assertFalse(Updater.is_frozen())

    def test_install_dir_none_in_test(self) -> None:
        from codegaai.core.updater import Updater
        Updater._instance = None
        upd = Updater.get()
        # Frozen değil → None
        self.assertIsNone(upd.install_dir())

    def test_apply_raises_when_not_frozen(self) -> None:
        from codegaai.core.updater import Updater
        Updater._instance = None
        upd = Updater.get()
        with self.assertRaises(RuntimeError):
            upd.apply()

    def test_apply_raises_when_no_download(self) -> None:
        from codegaai.core.updater import Updater
        # Frozen olsa bile indirme yoksa hata
        Updater._instance = None
        upd = Updater.get()
        # Manuel olarak frozen taklidi yapamıyoruz; sadece "RuntimeError"u
        # bekliyoruz (frozen kontrolü ilk geliyor, o yüzden bu test
        # yukarıdaki ile aynı)
        with self.assertRaises(RuntimeError):
            upd.apply()


class TestUpdaterApiContract(unittest.TestCase):

    @classmethod
    def setUpClass(cls) -> None:
        # Singleton sıfırla
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
        cls.db_path = Path(cls.tmpdir) / "p8_test.db"
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

    def test_status_endpoint(self) -> None:
        r = self.client.get("/api/updater/status")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["state"], "idle")
        self.assertIn("current_version", data)
        self.assertEqual(data["phase"], "Faz 8")

    def test_install_dir_endpoint(self) -> None:
        r = self.client.get("/api/updater/install-dir")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("frozen", data)
        self.assertIn("install_dir", data)

    def test_apply_when_not_frozen(self) -> None:
        # Test ortamı frozen değil → 409
        r = self.client.post("/api/updater/apply")
        self.assertEqual(r.status_code, 409)

    def test_engines_includes_updater(self) -> None:
        r = self.client.get("/api/system/engines")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("updater", data)
        self.assertEqual(data["updater"]["phase"], "Faz 8")

    def test_cleanup_endpoint(self) -> None:
        r = self.client.post("/api/updater/cleanup")
        self.assertEqual(r.status_code, 200)
        self.assertIn("deleted_count", r.json())


if __name__ == "__main__":
    unittest.main()
