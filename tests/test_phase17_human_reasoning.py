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
        self.assertIn("<thinking>.*?</thinking>", jobs_py)


if __name__ == "__main__":
    unittest.main()
