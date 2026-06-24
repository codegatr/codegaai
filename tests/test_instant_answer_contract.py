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

    def test_simple_math_with_turkish_chars_returns_without_model(self) -> None:
        from codegaai.core.instant_answers import instant_answer_for

        answer = instant_answer_for("2 + 2 kaç eder? Sadece sonucu yaz.")

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


class InstantAnswerCommandQATest(unittest.TestCase):
    def test_ubuntu_disk_command_returns_df_h(self) -> None:
        from codegaai.core.instant_answers import instant_answer_for

        answer = instant_answer_for("Ubuntu'da disk kullanımını gösteren komut nedir? Sadece komutu yaz.")

        self.assertIsNotNone(answer)
        self.assertEqual(answer.content, "df -h")
        self.assertEqual(answer.intent, "command_qa")

    def test_mysql_show_databases_command(self) -> None:
        from codegaai.core.instant_answers import instant_answer_for

        answer = instant_answer_for("MySQL'de tüm veritabanlarını listeleyen komut nedir? Sadece komutu yaz.")

        self.assertIsNotNone(answer)
        self.assertEqual(answer.content, "SHOW DATABASES;")
        self.assertEqual(answer.intent, "command_qa")

    def test_docker_ps_command(self) -> None:
        from codegaai.core.instant_answers import instant_answer_for

        answer = instant_answer_for("Docker'da çalışan containerları listeleyen komutu yaz. Sadece komutu yaz.")

        self.assertIsNotNone(answer)
        self.assertEqual(answer.content, "docker ps")
        self.assertEqual(answer.intent, "command_qa")

    def test_direct_output_does_not_return_placeholder_words(self) -> None:
        from codegaai.core.instant_answers import instant_answer_for

        self.assertIsNone(instant_answer_for("Sadece komutu yaz."))


if __name__ == "__main__":
    unittest.main()
