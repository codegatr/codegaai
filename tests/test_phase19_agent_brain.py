from __future__ import annotations

import unittest
from pathlib import Path


class TestAgentBrain(unittest.TestCase):
    def test_self_reference_does_not_force_web(self) -> None:
        from codegaai.core.agent_brain import decide_response

        decision = decide_response("Son güncellemelerden sonra sen daha iyi misin?")

        self.assertFalse(decision.needs_web)
        self.assertTrue(decision.should_stream)

    def test_explicit_current_search_uses_web_tool_path(self) -> None:
        from codegaai.core.agent_brain import decide_response

        decision = decide_response("İnternette ara: Qwen son benchmarkları")

        self.assertTrue(decision.needs_web)
        self.assertIn("web_search", decision.needs_tools)
        self.assertFalse(decision.should_stream)

    def test_code_execution_request_selects_tool_path(self) -> None:
        from codegaai.core.agent_brain import decide_response

        decision = decide_response("Python kodunu çalıştır ve sonucu hesapla: 2+2")

        self.assertEqual(decision.intent, "coding")
        self.assertIn("run_python", decision.needs_tools)
        self.assertIn("calculate", decision.needs_tools)

    def test_system_prompt_really_includes_tools(self) -> None:
        from codegaai.core.system_prompt import build_system_prompt

        prompt = build_system_prompt(include_tools=True)

        self.assertIn("<tool>", prompt)
        self.assertIn("web_search", prompt)
        self.assertIn("run_python", prompt)

    def test_polling_job_uses_agent_decision(self) -> None:
        src = Path("codegaai/api/routes/jobs.py").read_text(encoding="utf-8")

        self.assertIn("decide_response", src)
        self.assertIn("decision.should_stream", src)
        self.assertIn("engine.generate(messages, cfg=cfg, use_tools=True)", src)


if __name__ == "__main__":
    unittest.main()
