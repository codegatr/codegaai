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
        startup_py = (ROOT / "codegaai" / "core" / "startup.py").read_text(encoding="utf-8")

        self.assertIn("StartupDoctor", server_py)
        self.assertIn("_start_startup_web_learning", startup_py)
        self.assertIn("WebLearner", startup_py)
        self.assertIn("learn_async(feeds=True)", startup_py)
        self.assertIn("startup-web-learner", startup_py)

    def test_startup_doctor_auto_prepares_runtime(self) -> None:
        startup_py = (ROOT / "codegaai" / "core" / "startup.py").read_text(encoding="utf-8")

        self.assertIn("StartupDoctor", startup_py)
        self.assertIn("_prepare_llm", startup_py)
        self.assertIn("_prepare_embedding", startup_py)
        self.assertIn("_repair_llama_and_retry", startup_py)
        self.assertIn("AutonomousLearner.get().start()", startup_py)

    def test_feedback_corrections_enter_core_memory(self) -> None:
        learning_py = (ROOT / "codegaai" / "api" / "routes" / "learning.py").read_text(encoding="utf-8")

        self.assertIn("feedback_correction", learning_py)
        self.assertIn("preference_rule", learning_py)
        self.assertIn("Kullanıcı bu soru tipinde", learning_py)

    def test_polling_chat_uses_model_router(self) -> None:
        jobs_py = (ROOT / "codegaai" / "api" / "routes" / "jobs.py").read_text(encoding="utf-8")

        self.assertIn("ModelRouter", jobs_py)
        self.assertIn("select_model(job.message, history=history)", jobs_py)
        self.assertIn("switch_model_if_needed", jobs_py)


if __name__ == "__main__":
    unittest.main()
