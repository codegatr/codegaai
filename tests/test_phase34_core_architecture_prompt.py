from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


class TestCoreArchitecturePrompt(unittest.TestCase):
    def test_system_prompt_contains_core_architecture_contract(self) -> None:
        from codegaai.core.system_prompt import build_system_prompt

        prompt = build_system_prompt()

        self.assertIn("CODEGA AI Core Architecture", prompt)
        self.assertIn("Analysis, Assumptions, Domain Model", prompt)
        self.assertIn("users, vehicles, traffic_insurances", prompt)
        self.assertIn("backend icin Laravel Sanctum", prompt)
        self.assertIn("30 gun, 15 gun, 7 gun ve 1 gun", prompt)
        self.assertIn("Docker, Nginx, MySQL, Queue Worker, Scheduler/Cron ve SSL", prompt)
        self.assertIn("Flutter", prompt)

    def test_agent_brain_detects_architecture_planning_without_generation_tool(self) -> None:
        from codegaai.core.agent_brain import decide_response, decision_guidance

        decision = decide_response(
            "Arac Sigorta ve Muayene Takip Sistemi gelistir. PHP Laravel + Flutter kullan. "
            "Clean Architecture uygula. Henuz kod yazma. Sadece profesyonel proje mimarisi ve uygulama plani hazirla."
        )
        guidance = decision_guidance(decision)

        self.assertEqual(decision.intent, "architecture_planning")
        self.assertEqual(decision.response_style, "professional_architecture_plan")
        self.assertNotIn("generate_project", decision.needs_tools)
        self.assertIn("henuz kod yazma", guidance)
        self.assertIn("Database Design", guidance)
        self.assertIn("Laravel Architecture", guidance)
        self.assertIn("Security Plan", guidance)
        self.assertIn("Laravel icin Sanctum", guidance)
        self.assertIn("users, vehicles, traffic_insurances", guidance)
        self.assertIn("30 gun, 15 gun, 7 gun ve 1 gun", guidance)
        self.assertIn("Laravel Feature Test", guidance)

    def test_core_agent_files_exist(self) -> None:
        for rel in [
            "AGENTS.md",
            "CODEGA_CORE.md",
            "CODEGA_RULES.md",
            "CODEGA_SKILLS/architecture-planning.md",
        ]:
            self.assertTrue((ROOT / rel).exists(), rel)


if __name__ == "__main__":
    unittest.main()
