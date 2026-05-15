"""
Faz 2 duman testleri.

FastAPI uygulamasının import edilebildiğini, route'ların kayıtlı olduğunu
ve UI dosyalarının yerinde olduğunu doğrular.

Çalıştırmak için:
    python -m unittest tests.test_phase2
"""

from __future__ import annotations

import unittest
from pathlib import Path


class TestApiServer(unittest.TestCase):
    """FastAPI uygulaması yüklenebilir mi?"""

    def test_create_app(self) -> None:
        from codegaai.api.server import create_app
        app = create_app()
        self.assertIsNotNone(app)
        self.assertEqual(app.title, "CODEGA AI")

    def test_module_app(self) -> None:
        from codegaai.api.server import app
        self.assertIsNotNone(app)

    def test_routes_registered(self) -> None:
        from codegaai.api.server import app
        paths = {route.path for route in app.routes}

        expected = [
            "/api/system/info",
            "/api/system/health",
            "/api/system/check",
            "/api/system/engines",
            "/api/chat",
            "/api/chat/models",
            "/api/chat/status",
            "/api/image/generate",
            "/api/image/list",
            "/api/image/status",
            "/api/video/generate",
            "/api/video/list",
            "/api/video/status",
            "/api/audio/tts",
            "/api/audio/asr",
            "/api/memory/search",
            "/api/memory/learn",
            "/api/memory/stats",
            "/api/updater/check",
            "/api/updater/progress",
        ]
        for p in expected:
            self.assertIn(p, paths, f"Eksik rota: {p}")


class TestApiClient(unittest.TestCase):
    """TestClient ile endpoint'leri çağır."""

    @classmethod
    def setUpClass(cls) -> None:
        from fastapi.testclient import TestClient
        from codegaai.api.server import app
        cls.client = TestClient(app)

    def test_system_info(self) -> None:
        r = self.client.get("/api/system/info")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["name"], "CODEGA AI")
        self.assertIn("version", data)
        self.assertIn("models", data)

    def test_system_health(self) -> None:
        r = self.client.get("/api/system/health")
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertIn("ok", d)

    def test_system_check(self) -> None:
        r = self.client.get("/api/system/check")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("overall", data)
        self.assertIn("results", data)
        self.assertIsInstance(data["results"], list)

    def test_system_engines(self) -> None:
        r = self.client.get("/api/system/engines")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        for k in ("llm", "image", "audio", "video", "memory", "learning"):
            self.assertIn(k, data)
            self.assertIn("active", data[k])

    def test_chat_stub(self) -> None:
        r = self.client.post("/api/chat", json={
            "messages": [{"role": "user", "content": "Merhaba"}]
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["message"]["role"], "assistant")
        # Faz 3'te artık "LLM motoru yüklü değil" döner (motor yüklenmediği sürece)
        content = data["message"]["content"].lower()
        self.assertTrue("yüklü değil" in content or "faz" in content)

    def test_chat_models(self) -> None:
        r = self.client.get("/api/chat/models")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("loaded", data)
        self.assertIn("available_for_download", data)
        self.assertGreater(len(data["available_for_download"]), 0)

    def test_image_stub(self) -> None:
        # Faz 4'te image artık gerçek endpoint — motor yok = 409
        r = self.client.post("/api/image/generate", json={
            "prompt": "konya cumhuriyet meydanı"
        })
        self.assertIn(r.status_code, (200, 409))

    def test_memory_stats(self) -> None:
        r = self.client.get("/api/memory/stats")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        # Faz 3'te /stats gerçek alanlar döner
        for k in ("archive_documents", "core_facts", "vector_store",
                  "embedding_model"):
            self.assertIn(k, data)

    def test_root_serves_html(self) -> None:
        r = self.client.get("/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("text/html", r.headers.get("content-type", ""))
        self.assertIn("CODEGA AI", r.text)


class TestUIFiles(unittest.TestCase):
    """UI dosyalarının yerinde olduğunu kontrol et."""

    def test_html_exists(self) -> None:
        from codegaai.api.server import UI_ROOT
        self.assertTrue((UI_ROOT / "index.html").exists())

    def test_css_files(self) -> None:
        from codegaai.api.server import UI_ROOT
        for f in ("variables.css", "base.css", "layout.css",
                  "components.css", "views.css"):
            self.assertTrue((UI_ROOT / "css" / f).exists(),
                            f"Eksik CSS: {f}")

    def test_js_files(self) -> None:
        from codegaai.api.server import UI_ROOT
        for f in ("api.js", "views.js", "chat.js", "system.js", "app.js"):
            self.assertTrue((UI_ROOT / "js" / f).exists(),
                            f"Eksik JS: {f}")


if __name__ == "__main__":
    unittest.main()
