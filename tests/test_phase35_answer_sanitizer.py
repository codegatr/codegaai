from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class TestAnswerSanitizer(unittest.TestCase):
    def test_removes_internal_labels_and_pipe_duplicates(self) -> None:
        from codegaai.core.answer_sanitizer import sanitize_final_answer

        raw = (
            "TEST: Normal yarista birinciyi gecemezsin. | "
            "TEST: Normal yarista birinciyi gecemezsin. | "
            "MLVC: 100 kapi probleminde 10 kapi acik kalir."
        )

        clean = sanitize_final_answer(raw)

        self.assertNotIn("TEST:", clean)
        self.assertNotIn("MLVC:", clean)
        self.assertNotIn("|", clean)
        self.assertEqual(clean.count("Normal yarista"), 1)
        self.assertIn("100 kapi", clean)

    def test_architecture_fallback_contains_required_sections(self) -> None:
        from codegaai.core.answer_sanitizer import architecture_plan_fallback

        answer = architecture_plan_fallback(
            "Arac Sigorta ve Muayene Takip Sistemi gelistir. Henuz kod yazma."
        )

        for heading in [
            "# Analysis",
            "# Assumptions",
            "# Domain Model",
            "# Database Design",
            "# API Design",
            "# Laravel Architecture",
            "# Flutter Architecture",
            "# Reminder & Notification System",
            "# Security Plan",
            "# Testing Plan",
            "# Deployment Plan",
            "# Risks",
            "# First Implementation Tasks",
        ]:
            self.assertIn(heading, answer)

        self.assertIn("traffic_insurances", answer)
        self.assertIn("Laravel Sanctum", answer)

    def test_chat_paths_use_final_answer_sanitizer(self) -> None:
        jobs = (ROOT / "codegaai/api/routes/jobs.py").read_text(encoding="utf-8")
        chat = (ROOT / "codegaai/api/routes/chat.py").read_text(encoding="utf-8")

        self.assertIn("sanitize_final_answer", jobs)
        self.assertIn("sanitize_final_answer", chat)
        self.assertIn("architecture_plan_fallback", jobs)
        self.assertIn("architecture_plan_fallback", chat)
        self.assertIn('decision.intent == "architecture_planning"', jobs)

    def test_chat_keeps_agent_decision_for_architecture_fallback(self) -> None:
        chat = (ROOT / "codegaai/api/routes/chat.py").read_text(encoding="utf-8")
        generation_section = chat[
            chat.index("effective_max_tokens = req.max_tokens"):
            chat.index("cfg = GenerationConfig")
        ]

        self.assertNotIn("decision = None", generation_section)
        self.assertIn('decision.intent == "architecture_planning"', generation_section)


if __name__ == "__main__":
    unittest.main()
