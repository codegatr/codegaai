"""Faz 4 testleri - image registry ve API contracts."""

from __future__ import annotations

import unittest


class TestImageRegistry(unittest.TestCase):

    def test_list_image_models(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        models = reg.list_image_models()
        self.assertGreater(len(models), 0)
        ids = {m["id"] for m in models}
        self.assertIn("sdxl-base-1.0", ids)
        self.assertIn("sdxl-turbo", ids)
        self.assertIn("flux.1-schnell", ids)

    def test_image_model_required_fields(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        for m in reg.list_image_models():
            for k in ("id", "name", "hf_repo", "size_gb", "vram_gb",
                      "pipeline", "default_steps", "default_guidance",
                      "default_width", "default_height"):
                self.assertIn(k, m, f"{m['id']}: {k} eksik")

    def test_default_image_model(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        defaults = [m for m in reg.list_image_models() if m["default"]]
        self.assertEqual(len(defaults), 1)
        self.assertEqual(defaults[0]["id"], "sdxl-base-1.0")

    def test_image_path_under_models_dir(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        from codegaai.config import MODELS_DIR
        reg = ModelRegistry.get()
        path = reg.image_dir_path("sdxl-base-1.0")
        self.assertTrue(str(path).startswith(str(MODELS_DIR)))

    def test_unknown_image_returns_none(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        self.assertIsNone(reg.get_image_spec("ghost-image"))


class TestImageEngine(unittest.TestCase):

    def test_lazy_no_crash(self) -> None:
        from codegaai.core.image_engine import ImageEngine
        eng = ImageEngine.get()
        self.assertFalse(eng.is_ready)
        self.assertEqual(eng.status["state"], "unloaded")

    def test_generate_without_load_raises(self) -> None:
        from codegaai.core.image_engine import ImageEngine, GenerationRequest
        eng = ImageEngine.get()
        with self.assertRaises(RuntimeError):
            eng.generate(GenerationRequest(prompt="test"))

    def test_load_unknown_raises(self) -> None:
        from codegaai.core.image_engine import ImageEngine
        eng = ImageEngine.get()
        with self.assertRaises(ValueError):
            eng.load("ghost-image")


class TestImageApiContract(unittest.TestCase):

    @classmethod
    def setUpClass(cls) -> None:
        from codegaai.core.engine import LLMEngine
        from codegaai.core.embeddings import EmbeddingService
        from codegaai.core.image_engine import ImageEngine
        LLMEngine._instance = None
        EmbeddingService._instance = None
        ImageEngine._instance = None

        import tempfile
        from pathlib import Path
        from codegaai.core.chat_store import ChatStore
        cls.tmpdir = tempfile.mkdtemp()
        cls.db_path = Path(cls.tmpdir) / "p4_test.db"
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

    def test_models_includes_image(self) -> None:
        r = self.client.get("/api/models")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("image", data)
        self.assertGreater(len(data["image"]), 0)
        for m in data["image"]:
            self.assertIn("downloaded", m)
            self.assertIn("loaded", m)

    def test_image_status_endpoint(self) -> None:
        r = self.client.get("/api/image/status")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["state"], "unloaded")

    def test_image_generate_when_no_engine(self) -> None:
        r = self.client.post("/api/image/generate", json={
            "prompt": "test"
        })
        # Motor yok → 409
        self.assertEqual(r.status_code, 409)

    def test_image_list_empty(self) -> None:
        r = self.client.get("/api/image/list")
        self.assertEqual(r.status_code, 200)
        self.assertIn("images", r.json())

    def test_image_status_in_engines(self) -> None:
        r = self.client.get("/api/system/engines")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("image", data)
        self.assertEqual(data["image"]["phase"], "Faz 4")


if __name__ == "__main__":
    unittest.main()
