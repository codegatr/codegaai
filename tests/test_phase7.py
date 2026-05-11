"""Faz 7 testleri - self-learning (feedback + adapters + training wrapper)."""

from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path


class TestFeedbackStore(unittest.TestCase):

    def setUp(self) -> None:
        self.tmpdir = Path(tempfile.mkdtemp())
        from codegaai.core.learning import FeedbackStore
        FeedbackStore._instance = None
        self.store = FeedbackStore(db_path=self.tmpdir / "fb.db")

    def tearDown(self) -> None:
        from codegaai.core.learning import FeedbackStore
        FeedbackStore._instance = None
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_add_and_get(self) -> None:
        fb_id = self.store.add(
            chat_id=1, message_id=10, rating=1,
            user_message="merhaba", assistant_message="selam",
        )
        self.assertGreater(fb_id, 0)

        fb = self.store.get(1, 10)
        self.assertIsNotNone(fb)
        self.assertEqual(fb.rating, 1)
        self.assertEqual(fb.assistant_message, "selam")

    def test_invalid_rating_raises(self) -> None:
        with self.assertRaises(ValueError):
            self.store.add(chat_id=1, message_id=1, rating=5,
                           assistant_message="x")

    def test_upsert_updates(self) -> None:
        self.store.add(chat_id=1, message_id=10, rating=1,
                       assistant_message="ilk")
        self.store.add(chat_id=1, message_id=10, rating=-1,
                       assistant_message="ilk")
        fb = self.store.get(1, 10)
        self.assertEqual(fb.rating, -1)

    def test_remove(self) -> None:
        self.store.add(chat_id=1, message_id=10, rating=1,
                       assistant_message="x")
        ok = self.store.remove(1, 10)
        self.assertTrue(ok)
        self.assertIsNone(self.store.get(1, 10))

    def test_stats(self) -> None:
        self.store.add(chat_id=1, message_id=1, rating=1,
                       assistant_message="a")
        self.store.add(chat_id=1, message_id=2, rating=1,
                       assistant_message="b")
        self.store.add(chat_id=2, message_id=3, rating=-1,
                       assistant_message="c")
        s = self.store.stats()
        self.assertEqual(s["likes"], 2)
        self.assertEqual(s["dislikes"], 1)
        self.assertEqual(s["total"], 3)
        self.assertEqual(s["chats_with_feedback"], 2)

    def test_export_dpo_dataset_empty(self) -> None:
        ds = self.store.export_dpo_dataset(min_pairs=1)
        self.assertEqual(ds["pair_count"], 0)
        self.assertFalse(ds["ready_for_training"])

    def test_export_dpo_dataset_with_pairs(self) -> None:
        self.store.add(chat_id=1, message_id=1, rating=1,
                       user_message="prompt A",
                       assistant_message="iyi yanit")
        self.store.add(chat_id=2, message_id=2, rating=-1,
                       user_message="prompt A",
                       assistant_message="kotu yanit")
        ds = self.store.export_dpo_dataset(min_pairs=1)
        self.assertEqual(ds["pair_count"], 1)
        self.assertTrue(ds["ready_for_training"])
        self.assertEqual(ds["pairs"][0]["prompt"], "prompt A")
        self.assertEqual(ds["pairs"][0]["chosen"], "iyi yanit")
        self.assertEqual(ds["pairs"][0]["rejected"], "kotu yanit")

    def test_export_dpo_dataset_uses_negative_correction_note(self) -> None:
        self.store.add(chat_id=1, message_id=1, rating=-1,
                       user_message="prompt B",
                       assistant_message="yanlis yanit",
                       note="dogru yanit")

        ds = self.store.export_dpo_dataset(min_pairs=1)

        self.assertEqual(ds["pair_count"], 1)
        self.assertTrue(ds["ready_for_training"])
        self.assertEqual(ds["pairs"][0]["prompt"], "prompt B")
        self.assertEqual(ds["pairs"][0]["chosen"], "dogru yanit")
        self.assertEqual(ds["pairs"][0]["rejected"], "yanlis yanit")

    def test_export_dpo_dataset_negative_without_note_is_not_pair(self) -> None:
        self.store.add(chat_id=1, message_id=1, rating=-1,
                       user_message="prompt C",
                       assistant_message="yanlis yanit")

        ds = self.store.export_dpo_dataset(min_pairs=1)

        self.assertEqual(ds["pair_count"], 0)
        self.assertFalse(ds["ready_for_training"])


class TestAdapterManager(unittest.TestCase):

    def setUp(self) -> None:
        # AdapterManager DATA_DIR'i kullanıyor; izolasyon için singleton'u sıfırla
        from codegaai.core.learning import AdapterManager
        AdapterManager._instance = None

    def test_lazy_no_crash(self) -> None:
        from codegaai.core.learning import AdapterManager
        mgr = AdapterManager.get()
        self.assertIsNone(mgr.active_id)
        items = mgr.list()
        self.assertIsInstance(items, list)

    def test_activate_unknown_raises(self) -> None:
        from codegaai.core.learning import AdapterManager
        mgr = AdapterManager.get()
        with self.assertRaises(ValueError):
            mgr.activate("ghost-adapter")

    def test_register_and_list(self) -> None:
        from codegaai.core.learning import AdapterManager
        mgr = AdapterManager.get()
        adapter_id = "test-adapter-faz7"
        mgr.register(
            adapter_id=adapter_id,
            name="Test Adapter",
            base_model="qwen2.5-7b",
            description="unittest",
        )
        try:
            items = mgr.list()
            ids = {a.id for a in items}
            self.assertIn(adapter_id, ids)
        finally:
            mgr.delete(adapter_id)


class TestTrainingEngine(unittest.TestCase):

    def test_dependencies_check(self) -> None:
        from codegaai.core.learning import TrainingEngine
        deps = TrainingEngine.check_dependencies()
        # peft/trl/bnb sandbox'ta yüklü değil; sadece dict döndüğünü kontrol
        self.assertIsInstance(deps, dict)
        for k in ("peft", "trl", "bitsandbytes", "datasets"):
            self.assertIn(k, deps)
            self.assertIsInstance(deps[k], bool)

    def test_idle_status(self) -> None:
        from codegaai.core.learning import TrainingEngine
        TrainingEngine._instance = None
        eng = TrainingEngine.get()
        self.assertFalse(eng.is_training)
        self.assertEqual(eng.status["state"], "idle")

    def test_start_without_deps_raises(self) -> None:
        """peft/trl yoksa start_dpo RuntimeError atmalı."""
        from codegaai.core.learning import TrainingEngine
        TrainingEngine._instance = None
        eng = TrainingEngine.get()
        # Sandbox'ta deps yok varsayalım
        deps = TrainingEngine.check_dependencies()
        if not all(deps.values()):
            with self.assertRaises(RuntimeError):
                eng.start_dpo(
                    base_model_id="qwen2.5-7b-instruct-q4_k_m",
                    pairs=[{"prompt": "a", "chosen": "b", "rejected": "c"}] * 5,
                    adapter_name="test",
                )


class TestLearningApiContract(unittest.TestCase):

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
        for c in (LLMEngine, EmbeddingService, ImageEngine,
                  TTSEngine, ASREngine, VideoEngine,
                  FeedbackStore, AdapterManager, TrainingEngine):
            c._instance = None

        cls.tmpdir = tempfile.mkdtemp()
        from pathlib import Path
        from codegaai.core.chat_store import ChatStore
        cls.db_path = Path(cls.tmpdir) / "p7_test.db"
        ChatStore._instance = ChatStore(cls.db_path)

        from fastapi.testclient import TestClient
        from codegaai.api.server import app
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        from codegaai.core.chat_store import ChatStore
        ChatStore._instance = None
        shutil.rmtree(cls.tmpdir, ignore_errors=True)

    def test_feedback_add(self) -> None:
        r = self.client.post("/api/learning/feedback", json={
            "chat_id": 99, "message_id": 99, "rating": 1,
            "assistant_message": "test yanit",
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["stored"])

    def test_feedback_invalid_rating(self) -> None:
        r = self.client.post("/api/learning/feedback", json={
            "chat_id": 1, "message_id": 1, "rating": 99,
            "assistant_message": "x",
        })
        self.assertEqual(r.status_code, 400)

    def test_feedback_remove(self) -> None:
        # Önce ekle
        self.client.post("/api/learning/feedback", json={
            "chat_id": 88, "message_id": 88, "rating": -1,
            "assistant_message": "y",
        })
        r = self.client.delete("/api/learning/feedback/88/88")
        self.assertEqual(r.status_code, 200)

    def test_stats_endpoint(self) -> None:
        r = self.client.get("/api/learning/stats")
        self.assertEqual(r.status_code, 200)
        for k in ("likes", "dislikes", "total"):
            self.assertIn(k, r.json())

    def test_dataset_endpoint(self) -> None:
        r = self.client.get("/api/learning/dataset")
        self.assertEqual(r.status_code, 200)
        for k in ("pair_count", "min_required", "ready_for_training", "pairs"):
            self.assertIn(k, r.json())

    def test_adapters_list(self) -> None:
        r = self.client.get("/api/learning/adapters")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("adapters", data)
        self.assertIn("active_id", data)

    def test_dependencies_endpoint(self) -> None:
        r = self.client.get("/api/learning/dependencies")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("dependencies", data)
        self.assertIn("ready", data)

    def test_training_status(self) -> None:
        r = self.client.get("/api/learning/status")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["phase"], "Faz 7")

    def test_train_when_no_data(self) -> None:
        r = self.client.post("/api/learning/train", json={
            "base_model_id": "qwen2.5-7b-instruct-q4_k_m",
            "adapter_name": "test",
        })
        # Yeterli veri yok -> 409
        self.assertIn(r.status_code, (409, 200))

    def test_engines_includes_learning(self) -> None:
        r = self.client.get("/api/system/engines")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("learning", data)
        self.assertEqual(data["learning"]["phase"], "Faz 7")


if __name__ == "__main__":
    unittest.main()
