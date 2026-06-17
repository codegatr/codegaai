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

    def test_sanitizer_removes_leaked_calculate_tool(self) -> None:
        from codegaai.core.answer_sanitizer import sanitize_final_answer

        text = '<tool>calculate("2+2")</tool>Sonuc: 4'

        self.assertEqual(sanitize_final_answer(text), "4")

    def test_jobs_inline_tool_supports_calculate_name(self) -> None:
        from codegaai.api.routes.jobs import _execute_inline_tools

        out = asyncio.run(_execute_inline_tools('<tool>calculate("2+2")</tool>', None))

        self.assertEqual(out.strip(), "4")


if __name__ == "__main__":
    unittest.main()
