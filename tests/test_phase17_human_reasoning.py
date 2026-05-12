"""Conversation intelligence contracts for human-like CODEGA replies."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


class TestHumanReasoningContracts(unittest.TestCase):

    def test_system_prompt_has_human_inference_examples(self) -> None:
        from codegaai.core.system_prompt import build_system_prompt

        prompt = build_system_prompt()
        self.assertIn("Leb", prompt)
        self.assertIn("Tekcan Metal", prompt)
        self.assertIn("Size nasil yardimci olabilirim", prompt)
        self.assertIn("asil soruyu kendin cikar", prompt)

    def test_agent_brain_detects_implicit_reasoning(self) -> None:
        from codegaai.core.agent_brain import decide_response, decision_guidance

        decision = decide_response("Arkadasim Tekcan Metal'i sorsan bilmez dedi.")
        self.assertEqual(decision.intent, "implicit_context")
        self.assertTrue(decision.needs_careful_reasoning)
        self.assertEqual(decision.response_style, "human_inference")
        self.assertIn("Genel yardim teklifiyle kacma", decision_guidance(decision))

    def test_jobs_auto_reasoning_and_thought_scrub_are_present(self) -> None:
        jobs_py = (ROOT / "codegaai" / "api" / "routes" / "jobs.py").read_text(encoding="utf-8")

        self.assertIn("auto_think = bool(job.deep_think or decision.needs_careful_reasoning)", jobs_py)
        self.assertIn("Otomatik Akil Yurutme", jobs_py)
        self.assertIn("_clean_visible_answer", jobs_py)
        self.assertIn("_fallback_empty_response", jobs_py)

    def test_empty_thought_only_answer_gets_fallback(self) -> None:
        jobs_py = (ROOT / "codegaai" / "api" / "routes" / "jobs.py").read_text(encoding="utf-8")

        self.assertIn("r\"<think(?:ing)?>(.*?)</think(?:ing)?>", jobs_py)
        self.assertIn("Cevap uretimi bos dondu", jobs_py)
        self.assertIn("mantik cercevesinde konusalim", jobs_py)

    def test_deterministic_php_rental_project_builder_is_present(self) -> None:
        files_py = (ROOT / "codegaai" / "api" / "routes" / "files.py").read_text(encoding="utf-8")

        self.assertIn("def create_php_project_zip", files_py)
        self.assertIn("Online Arac Kiralama Sistemi", files_py)
        self.assertIn("schema.sql", files_py)
        self.assertIn("reservations", files_py)
        self.assertIn("source_context", files_py)
        self.assertIn("Havalimani Teslim", files_py)


if __name__ == "__main__":
    unittest.main()
