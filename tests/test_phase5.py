"""Faz 5 testleri - audio (TTS + ASR) registry, engines, API."""

from __future__ import annotations

import unittest


class TestAudioRegistry(unittest.TestCase):

    def test_list_audio_models(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        models = reg.list_audio_models()
        self.assertGreater(len(models), 0)
        ids = {m["id"] for m in models}
        self.assertIn("xtts-v2", ids)
        self.assertIn("faster-whisper-large-v3", ids)

    def test_audio_kinds(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        models = reg.list_audio_models()
        kinds = {m["kind"] for m in models}
        self.assertIn("tts", kinds)
        self.assertIn("asr", kinds)

    def test_audio_required_fields(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        for m in reg.list_audio_models():
            for k in ("id", "name", "kind", "hf_repo", "size_gb", "vram_gb",
                      "languages", "sample_rate"):
                self.assertIn(k, m, f"{m['id']}: {k} eksik")

    def test_audio_path_under_models_dir(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        from codegaai.config import MODELS_DIR
        reg = ModelRegistry.get()
        path = reg.audio_dir_path("xtts-v2")
        self.assertTrue(str(path).startswith(str(MODELS_DIR)))


class TestTTSEngine(unittest.TestCase):

    def test_lazy_no_crash(self) -> None:
        from codegaai.core.audio_engine import TTSEngine
        eng = TTSEngine.get()
        self.assertFalse(eng.is_ready)

    def test_synthesize_without_load_raises(self) -> None:
        from codegaai.core.audio_engine import TTSEngine
        eng = TTSEngine.get()
        with self.assertRaises(RuntimeError):
            eng.synthesize("merhaba", language="tr")

    def test_load_unknown_raises(self) -> None:
        from codegaai.core.audio_engine import TTSEngine
        eng = TTSEngine.get()
        with self.assertRaises(ValueError):
            eng.load("ghost-tts")


class TestASREngine(unittest.TestCase):

    def test_lazy_no_crash(self) -> None:
        from codegaai.core.audio_engine import ASREngine
        eng = ASREngine.get()
        self.assertFalse(eng.is_ready)

    def test_transcribe_without_load_raises(self) -> None:
        from codegaai.core.audio_engine import ASREngine
        eng = ASREngine.get()
        with self.assertRaises(RuntimeError):
            eng.transcribe("/dev/null")

    def test_load_unknown_raises(self) -> None:
        from codegaai.core.audio_engine import ASREngine
        eng = ASREngine.get()
        with self.assertRaises(ValueError):
            eng.load("ghost-asr")


class TestAudioApiContract(unittest.TestCase):

    @classmethod
    def setUpClass(cls) -> None:
        # Singleton sıfırlama
        from codegaai.core.engine import LLMEngine
        from codegaai.core.embeddings import EmbeddingService
        from codegaai.core.image_engine import ImageEngine
        from codegaai.core.audio_engine import TTSEngine, ASREngine
        LLMEngine._instance = None
        EmbeddingService._instance = None
        ImageEngine._instance = None
        TTSEngine._instance = None
        ASREngine._instance = None

        import tempfile
        from pathlib import Path
        from codegaai.core.chat_store import ChatStore
        cls.tmpdir = tempfile.mkdtemp()
        cls.db_path = Path(cls.tmpdir) / "p5_test.db"
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

    def test_models_includes_audio(self) -> None:
        r = self.client.get("/api/models")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("audio", data)
        self.assertGreater(len(data["audio"]), 0)

    def test_audio_status_endpoint(self) -> None:
        r = self.client.get("/api/audio/status")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("tts", data)
        self.assertIn("asr", data)

    def test_tts_when_no_engine(self) -> None:
        r = self.client.post("/api/audio/tts", json={
            "text": "merhaba", "language": "tr"
        })
        self.assertEqual(r.status_code, 409)

    def test_asr_when_no_engine(self) -> None:
        # Boş upload
        import io
        r = self.client.post("/api/audio/asr", files={
            "audio": ("test.wav", io.BytesIO(b"\x00" * 100), "audio/wav")
        })
        self.assertEqual(r.status_code, 409)

    def test_audio_list_empty(self) -> None:
        r = self.client.get("/api/audio/list")
        self.assertEqual(r.status_code, 200)
        self.assertIn("files", r.json())

    def test_engines_includes_audio(self) -> None:
        r = self.client.get("/api/system/engines")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("audio", data)
        self.assertEqual(data["audio"]["phase"], "Faz 5")


if __name__ == "__main__":
    unittest.main()
