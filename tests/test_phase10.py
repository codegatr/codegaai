"""Faz 10 testleri - İnternet Öğrenmesi."""

from __future__ import annotations

import json
import shutil
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


class TestWebLearnerCore(unittest.TestCase):

    @classmethod
    def setUpClass(cls) -> None:
        cls.tmpdir = Path(tempfile.mkdtemp())

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(cls.tmpdir, ignore_errors=True)
        from codegaai.core.web_learner import WebLearner
        WebLearner._instance = None

    def setUp(self) -> None:
        from codegaai.core.web_learner import WebLearner, WEB_LEARN_DIR
        WebLearner._instance = None
        # Test dizini
        import codegaai.core.web_learner as wl_mod
        wl_mod.WEB_LEARN_DIR = self.tmpdir / "web_learning"
        wl_mod.FEED_SOURCES_FILE = wl_mod.WEB_LEARN_DIR / "feed_sources.json"
        wl_mod.LEARN_LOG_FILE = wl_mod.WEB_LEARN_DIR / "learn_log.jsonl"

    def test_singleton(self) -> None:
        from codegaai.core.web_learner import WebLearner
        a = WebLearner.get()
        b = WebLearner.get()
        self.assertIs(a, b)

    def test_default_feeds_created(self) -> None:
        from codegaai.core.web_learner import WebLearner, FEED_SOURCES_FILE
        WebLearner.get()
        self.assertTrue(FEED_SOURCES_FILE.exists())
        feeds = json.loads(FEED_SOURCES_FILE.read_text(encoding="utf-8"))
        self.assertGreater(len(feeds), 0)
        self.assertIn("url", feeds[0])

    def test_add_feed(self) -> None:
        from codegaai.core.web_learner import WebLearner
        lrn = WebLearner.get()
        count_before = len(lrn.list_feeds())
        lrn.add_feed("Test Feed", "https://example.com/rss", "rss", "test")
        self.assertEqual(len(lrn.list_feeds()), count_before + 1)

    def test_toggle_feed(self) -> None:
        from codegaai.core.web_learner import WebLearner
        lrn = WebLearner.get()
        lrn.add_feed("Toggle Test", "https://example.com/rss2", "rss", "test")
        idx = len(lrn.list_feeds()) - 1
        lrn.toggle_feed(idx, False)
        self.assertFalse(lrn.list_feeds()[idx]["enabled"])
        lrn.toggle_feed(idx, True)
        self.assertTrue(lrn.list_feeds()[idx]["enabled"])

    def test_delete_feed(self) -> None:
        from codegaai.core.web_learner import WebLearner
        lrn = WebLearner.get()
        lrn.add_feed("Delete Me", "https://example.com/rss3", "rss", "test")
        count = len(lrn.list_feeds())
        lrn.delete_feed(count - 1)
        self.assertEqual(len(lrn.list_feeds()), count - 1)

    def test_status_idle(self) -> None:
        from codegaai.core.web_learner import WebLearner
        lrn = WebLearner.get()
        st = lrn.status
        self.assertEqual(st["state"], "idle")
        self.assertIn("total_learned", st)
        self.assertIn("feeds", st)

    def test_write_read_log(self) -> None:
        from codegaai.core.web_learner import WebLearner, WebResult
        lrn = WebLearner.get()
        results = [WebResult("T1", "http://x.com", "s1", content="body")]
        lrn._write_log(["konuA"], results, 1)
        log = lrn.get_log(limit=10)
        self.assertGreater(len(log), 0)
        self.assertEqual(log[0]["topics"], ["konuA"])
        self.assertEqual(log[0]["stored"], 1)

    def test_extract_topics_fallback(self) -> None:
        """LLM yüklü değilken keyword fallback çalışmalı."""
        from codegaai.core.web_learner import WebLearner
        lrn = WebLearner.get()
        messages = [
            {"role": "user", "content": "Python machine learning frameworks"},
            {"role": "assistant", "content": "Python for machine learning includes pytorch tensorflow"},
        ]
        topics = lrn.extract_topics_from_chat(messages, max_topics=3)
        self.assertIsInstance(topics, list)
        self.assertGreater(len(topics), 0)

    def test_search_mock(self) -> None:
        """DDG aramasını mock'la, WebResult list döner mi?"""
        import sys
        from codegaai.core.web_learner import WebLearner, WebResult

        mock_ddg_result = [
            {"title": "AI News", "href": "https://ai.com/news", "body": "AI is growing."},
        ]

        mock_ddgs_instance = MagicMock()
        mock_ddgs_instance.__enter__ = MagicMock(return_value=mock_ddgs_instance)
        mock_ddgs_instance.__exit__ = MagicMock(return_value=False)
        mock_ddgs_instance.text.return_value = iter(mock_ddg_result)

        mock_mod = MagicMock()
        mock_mod.DDGS.return_value = mock_ddgs_instance

        original = sys.modules.get("duckduckgo_search")
        sys.modules["duckduckgo_search"] = mock_mod

        try:
            lrn = WebLearner.get()
            results = lrn.search("AI", max_results=1)
        finally:
            if original is not None:
                sys.modules["duckduckgo_search"] = original
            else:
                sys.modules.pop("duckduckgo_search", None)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].title, "AI News")
        self.assertEqual(results[0].url, "https://ai.com/news")

    def test_cancel(self) -> None:
        from codegaai.core.web_learner import WebLearner
        lrn = WebLearner.get()
        # idle'da cancel False
        self.assertFalse(lrn.cancel())
        # state'i simüle et
        lrn._status.state = "searching"
        self.assertTrue(lrn.cancel())
        lrn._status.state = "idle"


class TestScheduler(unittest.TestCase):

    @classmethod
    def setUpClass(cls) -> None:
        from codegaai.core.scheduler import Scheduler
        Scheduler._instance = None

    @classmethod
    def tearDownClass(cls) -> None:
        from codegaai.core.scheduler import Scheduler
        s = Scheduler._instance
        if s:
            s.stop()
        Scheduler._instance = None

    def test_singleton(self) -> None:
        from codegaai.core.scheduler import Scheduler
        a = Scheduler.get()
        b = Scheduler.get()
        self.assertIs(a, b)

    def test_register_and_run_now(self) -> None:
        from codegaai.core.scheduler import Scheduler
        sched = Scheduler.get()
        ran = threading.Event()

        def _job():
            ran.set()

        sched.register("test_run_now", "Test İş", _job,
                       interval_seconds=9999)
        sched.run_now("test_run_now")
        ran.wait(timeout=3.0)
        self.assertTrue(ran.is_set())

    def test_toggle(self) -> None:
        from codegaai.core.scheduler import Scheduler
        sched = Scheduler.get()
        sched.register("test_toggle", "Toggle Test", lambda: None,
                       interval_seconds=9999, enabled=True)
        sched.toggle("test_toggle", False)
        job = next(j for j in sched.jobs if j["id"] == "test_toggle")
        self.assertFalse(job["enabled"])

    def test_job_list(self) -> None:
        from codegaai.core.scheduler import Scheduler
        jobs = Scheduler.get().jobs
        self.assertIsInstance(jobs, list)
        for j in jobs:
            self.assertIn("id", j)
            self.assertIn("name", j)
            self.assertIn("enabled", j)


class TestLearnApiContract(unittest.TestCase):

    @classmethod
    def setUpClass(cls) -> None:
        from codegaai.core.engine import LLMEngine
        from codegaai.core.embeddings import EmbeddingService
        from codegaai.core.image_engine import ImageEngine
        from codegaai.core.audio_engine import TTSEngine, ASREngine
        from codegaai.core.video_engine import VideoEngine
        from codegaai.core.learning import FeedbackStore, AdapterManager, TrainingEngine
        from codegaai.core.updater import Updater
        from codegaai.core.web_learner import WebLearner
        from codegaai.core.scheduler import Scheduler

        for c in (LLMEngine, EmbeddingService, ImageEngine, TTSEngine, ASREngine,
                  VideoEngine, FeedbackStore, AdapterManager, TrainingEngine,
                  Updater, WebLearner, Scheduler):
            c._instance = None

        import tempfile
        from pathlib import Path
        from codegaai.core.chat_store import ChatStore
        cls.tmpdir = tempfile.mkdtemp()
        ChatStore._instance = ChatStore(Path(cls.tmpdir) / "test.db")

        from fastapi.testclient import TestClient
        from codegaai.api.server import create_app
        cls.client = TestClient(create_app())

    @classmethod
    def tearDownClass(cls) -> None:
        from codegaai.core.chat_store import ChatStore
        ChatStore._instance = None
        import shutil
        shutil.rmtree(cls.tmpdir, ignore_errors=True)

    def test_status_endpoint(self) -> None:
        r = self.client.get("/api/learn/status")
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d["state"], "idle")
        self.assertIn("feeds", d)
        self.assertEqual(d["phase"], "Faz 10")

    def test_feeds_list(self) -> None:
        r = self.client.get("/api/learn/feeds")
        self.assertEqual(r.status_code, 200)
        self.assertIn("feeds", r.json())

    def test_feeds_add_delete(self) -> None:
        r = self.client.post("/api/learn/feeds/add", json={
            "name": "Test Feed",
            "url": "https://example.com/rss",
            "type": "rss",
            "category": "test",
        })
        self.assertEqual(r.status_code, 200)
        feeds = r.json()["feeds"]
        idx = next(i for i, f in enumerate(feeds) if f["name"] == "Test Feed")
        # Toggle
        r2 = self.client.patch(f"/api/learn/feeds/{idx}/toggle",
                                json={"enabled": False})
        self.assertEqual(r2.status_code, 200)
        # Delete
        r3 = self.client.delete(f"/api/learn/feeds/{idx}")
        self.assertEqual(r3.status_code, 200)

    def test_scheduler_endpoint(self) -> None:
        r = self.client.get("/api/learn/scheduler")
        self.assertEqual(r.status_code, 200)
        self.assertIn("jobs", r.json())

    def test_log_endpoint(self) -> None:
        r = self.client.get("/api/learn/log")
        self.assertEqual(r.status_code, 200)
        self.assertIn("log", r.json())


if __name__ == "__main__":
    unittest.main()
