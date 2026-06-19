"""
Faz 3 testleri.

Modeller (llama-cpp, torch, chromadb) sandbox'ta yüklü olmadığı için
testler **lazy import** prensibini doğrular:
- Çekirdek modüller ML kütüphaneleri olmadan import edilebilir
- Engine/Embedding `is_ready=False` durumda makul davranır
- API endpoint'leri motor yüklü değilken bile yanıt verir
- Model registry tüm sözleşmesini yerine getirir

Çalıştırmak için:
    python -m unittest tests.test_phase3
"""

from __future__ import annotations

import unittest


class TestModelRegistry(unittest.TestCase):
    """Model kataloğu sözleşmesi."""

    def test_list_llm_models(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        models = reg.list_llm_models()
        self.assertGreater(len(models), 0)

        ids = {m["id"] for m in models}
        self.assertIn("qwen3-4b-q4_k_m", ids)
        self.assertIn("qwen3-8b-q4_k_m", ids)
        self.assertIn("qwen2.5-7b-instruct-q4_k_m", ids)
        self.assertIn("llama-3.1-8b-instruct-q4_k_m", ids)
        self.assertIn("aya-expanse-8b-q4_k_m", ids)

    def test_each_model_has_required_fields(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        for m in reg.list_llm_models():
            for field in ("id", "name", "hf_repo", "hf_file",
                          "size_gb", "vram_gb"):
                self.assertIn(field, m, f"{m['id']}: {field} eksik")

    def test_default_llm_marked(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        defaults = [m for m in reg.list_llm_models() if m.get("default")]
        self.assertEqual(len(defaults), 1)
        self.assertEqual(defaults[0]["id"], "qwen3-4b-q4_k_m")

    def test_get_llm_spec(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        spec = reg.get_llm_spec("qwen3-4b-q4_k_m")
        self.assertIsNotNone(spec)
        # bartowski'nin tek-dosyalı GGUF repo'sunu kullanıyoruz
        # (resmi Qwen repo'su Q4_K_M'i parçalara bölmüş)
        self.assertIn("Qwen3-4B-GGUF", spec.hf_repo)
        self.assertTrue(spec.hf_file.endswith(".gguf"))

    def test_unknown_model_returns_none(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        self.assertIsNone(reg.get_llm_spec("bogus"))

    def test_llm_path_under_models_dir(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        from codegaai.config import MODELS_DIR
        reg = ModelRegistry.get()
        path = reg.llm_path("qwen2.5-7b-instruct-q4_k_m")
        self.assertTrue(str(path).startswith(str(MODELS_DIR)))
        self.assertEqual(path.suffix, ".gguf")

    def test_progress_initial(self) -> None:
        from codegaai.core.models_registry import ModelRegistry
        reg = ModelRegistry.get()
        p = reg.get_progress("nonexistent")
        self.assertEqual(p.status, "idle")
        self.assertEqual(p.downloaded, 0)


class TestLLMEngine(unittest.TestCase):
    """LLM motoru — yüklü değilken davranış."""

    def test_lazy_import_no_crash(self) -> None:
        from codegaai.core.engine import LLMEngine
        engine = LLMEngine.get()
        self.assertFalse(engine.is_ready)
        self.assertEqual(engine.status["state"], "unloaded")

    def test_generate_without_model_raises(self) -> None:
        from codegaai.core.engine import LLMEngine
        engine = LLMEngine.get()
        with self.assertRaises(RuntimeError):
            engine.generate([{"role": "user", "content": "merhaba"}])

    def test_load_unknown_model_raises(self) -> None:
        from codegaai.core.engine import LLMEngine
        engine = LLMEngine.get()
        with self.assertRaises(ValueError):
            engine.load("ghost-model-9000")


class TestEmbeddingService(unittest.TestCase):
    def test_lazy_no_crash(self) -> None:
        from codegaai.core.embeddings import EmbeddingService
        svc = EmbeddingService.get()
        self.assertFalse(svc.is_ready)


class TestApiContracts(unittest.TestCase):
    """API endpoint'leri motor yüklü değilken de cevap vermeli."""

    @classmethod
    def setUpClass(cls) -> None:
        # Singleton'ları sıfırla
        from codegaai.core.engine import LLMEngine
        from codegaai.core.embeddings import EmbeddingService
        LLMEngine._instance = None
        EmbeddingService._instance = None

        # Geçici DB
        import tempfile
        from pathlib import Path
        from codegaai.core.chat_store import ChatStore

        cls.tmpdir = tempfile.mkdtemp()
        cls.db_path = Path(cls.tmpdir) / "p3_test.db"
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

    def test_models_list(self) -> None:
        r = self.client.get("/api/models")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("llm", data)
        self.assertIn("embedding", data)
        self.assertGreater(len(data["llm"]), 0)
        # Her LLM model için download status alanı var
        for m in data["llm"]:
            self.assertIn("downloaded", m)
            self.assertIn("loaded", m)
            self.assertIn("download", m)

    def test_models_llm_only(self) -> None:
        r = self.client.get("/api/models/llm")
        self.assertEqual(r.status_code, 200)
        self.assertGreater(len(r.json()["models"]), 0)

    def test_model_status(self) -> None:
        r = self.client.get("/api/models/qwen2.5-7b-instruct-q4_k_m/status")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertFalse(data["downloaded"])
        self.assertFalse(data["loaded"])

    def test_model_status_unknown(self) -> None:
        r = self.client.get("/api/models/ghost/status")
        self.assertEqual(r.status_code, 404)

    def test_chat_falls_back_to_stub_when_no_model(self) -> None:
        """Motor yüklü olmadığında 200 + 'model yüklü değil' notu."""
        r = self.client.post("/api/chat", json={
            "messages": [{"role": "user", "content": "merhaba"}]
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["model"], "instant")
        self.assertIn("merhaba", data["message"]["content"].lower())

    def test_chat_status(self) -> None:
        r = self.client.get("/api/chat/status")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["state"], "unloaded")

    def test_engines_endpoint(self) -> None:
        r = self.client.get("/api/system/engines")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        for k in ("llm", "embedding", "memory", "image", "audio", "video"):
            self.assertIn(k, data)
        # LLM unloaded durumda
        self.assertFalse(data["llm"]["active"])

    def test_memory_status_endpoint(self) -> None:
        r = self.client.get("/api/memory/status")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("chromadb_installed", data)


if __name__ == "__main__":
    unittest.main()
