"""Faz 6 testleri - video registry, engine, API."""

from __future__ import annotations

import unittest


class TestVideoRegistry(unittest.TestCase):

    def test_list_video_models(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        models = reg.list_video_models()
        self.assertGreater(len(models), 0)
        ids = {m["id"] for m in models}
        self.assertIn("cogvideox-2b", ids)
        self.assertIn("svd-xt", ids)

    def test_video_pipelines(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        pipelines = {m["pipeline"] for m in reg.list_video_models()}
        self.assertIn("cogvideox", pipelines)
        self.assertIn("svd", pipelines)

    def test_video_modes(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        modes = {m["mode"] for m in reg.list_video_models()}
        self.assertIn("t2v", modes)
        self.assertIn("i2v", modes)

    def test_video_default(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        defaults = [m for m in reg.list_video_models() if m["default"]]
        self.assertEqual(len(defaults), 1)
        self.assertEqual(defaults[0]["id"], "cogvideox-2b")

    def test_video_required_fields(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        for m in reg.list_video_models():
            for k in ("id", "name", "hf_repo", "size_gb", "vram_gb",
                      "pipeline", "mode", "default_steps", "default_frames",
                      "default_fps"):
                self.assertIn(k, m, f"{m['id']}: {k} eksik")


class TestVideoEngine(unittest.TestCase):

    def test_lazy_no_crash(self) -> None:
        from codegaai.core.video_engine import VideoEngine
        eng = VideoEngine.get()
        self.assertFalse(eng.is_ready)

    def test_generate_without_load_raises(self) -> None:
        from codegaai.core.video_engine import VideoEngine, VideoRequest
        eng = VideoEngine.get()
        with self.assertRaises(RuntimeError):
            eng.generate(VideoRequest(prompt="test"))

    def test_load_unknown_raises(self) -> None:
        from codegaai.core.video_engine import VideoEngine
        eng = VideoEngine.get()
        with self.assertRaises(ValueError):
            eng.load("ghost-video")


class TestVideoApiContract(unittest.TestCase):

    @classmethod
    def setUpClass(cls) -> None:
        # Singleton sıfırlama
        from codegaai.core.engine import LLMEngine
        from codegaai.core.embeddings import EmbeddingService
        from codegaai.core.image_engine import ImageEngine
        from codegaai.core.audio_engine import TTSEngine, ASREngine
        from codegaai.core.video_engine import VideoEngine
        for cls_ in (LLMEngine, EmbeddingService, ImageEngine,
                     TTSEngine, ASREngine, VideoEngine):
            cls_._instance = None

        import tempfile
        from pathlib import Path
        from codegaai.core.chat_store import ChatStore
        cls.tmpdir = tempfile.mkdtemp()
        cls.db_path = Path(cls.tmpdir) / "p6_test.db"
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

    def test_models_includes_video(self) -> None:
        r = self.client.get("/api/models")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("video", data)
        self.assertGreater(len(data["video"]), 0)
        for m in data["video"]:
            self.assertIn("downloaded", m)
            self.assertIn("loaded", m)

    def test_video_status_endpoint(self) -> None:
        r = self.client.get("/api/video/status")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["state"], "unloaded")

    def test_video_generate_when_no_engine(self) -> None:
        r = self.client.post("/api/video/generate", json={
            "prompt": "test"
        })
        self.assertEqual(r.status_code, 409)

    def test_video_list_empty(self) -> None:
        r = self.client.get("/api/video/list")
        self.assertEqual(r.status_code, 200)
        self.assertIn("videos", r.json())

    def test_engines_includes_video(self) -> None:
        r = self.client.get("/api/system/engines")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("video", data)
        self.assertEqual(data["video"]["phase"], "Faz 6")


if __name__ == "__main__":
    unittest.main()
