"""Startup learning and chat model routing guardrails."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


class TestStartupLearningAndRouting(unittest.TestCase):

    def test_default_config_enables_startup_web_learning(self) -> None:
        from codegaai.config import DEFAULT_CONFIG

        learning = DEFAULT_CONFIG["learning"]
        self.assertTrue(learning["auto_web_learn_on_startup"])
        self.assertGreaterEqual(learning["startup_web_learn_delay_seconds"], 0)

    def test_server_starts_web_learning_thread(self) -> None:
        server_py = (ROOT / "codegaai" / "api" / "server.py").read_text(encoding="utf-8")

        self.assertIn("_start_web_learning", server_py)
        self.assertIn("WebLearner", server_py)
        self.assertIn("learn_async(feeds=True)", server_py)
        self.assertIn("startup-web-learner", server_py)

    def test_polling_chat_uses_model_router(self) -> None:
        jobs_py = (ROOT / "codegaai" / "api" / "routes" / "jobs.py").read_text(encoding="utf-8")

        self.assertIn("ModelRouter", jobs_py)
        self.assertIn("select_model(job.message, history=history)", jobs_py)
        self.assertIn("switch_model_if_needed", jobs_py)


if __name__ == "__main__":
    unittest.main()
