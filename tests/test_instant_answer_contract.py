from __future__ import annotations

import asyncio
import unittest


class InstantAnswerContractTest(unittest.TestCase):
    def test_simple_math_returns_without_model(self) -> None:
        from codegaai.core.instant_answers import instant_answer_for

        answer = instant_answer_for("2 + 2 kac eder? Sadece sonucu yaz.")

        self.assertIsNotNone(answer)
        self.assertEqual(answer.content, "4")
        self.assertEqual(answer.intent, "calculation")

    def test_direct_output_command_returns_exact_text_without_model(self) -> None:
        from codegaai.core.instant_answers import instant_answer_for

        answer = instant_answer_for("Sadece OK yaz. Başka hiçbir şey yazma.")

        self.assertIsNotNone(answer)
        self.assertEqual(answer.content, "OK")
        self.assertEqual(answer.intent, "direct_output")

    def test_sanitizer_removes_leaked_calculate_tool(self) -> None:
        from codegaai.core.answer_sanitizer import sanitize_final_answer

        text = '<tool>calculate("2+2")</tool>Sonuc: 4'

        self.assertEqual(sanitize_final_answer(text), "4")

    def test_jobs_inline_tool_supports_calculate_name(self) -> None:
        from codegaai.api.routes.jobs import _execute_inline_tools

        out = asyncio.run(_execute_inline_tools('<tool>calculate("2+2")</tool>', None))

        self.assertEqual(out.strip(), "4")

    def test_background_jobs_use_instant_answer_before_model(self) -> None:
        from pathlib import Path

        root = Path(__file__).resolve().parents[1]
        jobs = (root / "codegaai/api/routes/jobs.py").read_text(encoding="utf-8")

        self.assertIn("instant_answer_for(job.message)", jobs)
        self.assertLess(jobs.index("instant_answer_for(job.message)"), jobs.index("LLMEngine.get()"))


if __name__ == "__main__":
    unittest.main()
