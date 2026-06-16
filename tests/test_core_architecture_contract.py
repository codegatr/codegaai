from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


class CoreArchitectureContractTest(unittest.TestCase):
    def test_system_prompt_contains_professional_architecture_contract(self) -> None:
        from codegaai.core.system_prompt import build_system_prompt

        prompt = build_system_prompt()

        self.assertIn("CODEGA AI Core Architecture", prompt)
        self.assertIn("Analysis, Assumptions, Domain Model", prompt)
        self.assertIn("Laravel Architecture", prompt)
        self.assertIn("Reminder & Notification System", prompt)
        self.assertIn("users, vehicles, traffic_insurances", prompt)
        self.assertIn("backend icin Laravel Sanctum", prompt)
        self.assertIn("30 gun, 15 gun, 7 gun ve 1 gun", prompt)
        self.assertIn("Docker, Nginx, MySQL, Queue Worker, Scheduler/Cron ve SSL", prompt)

    def test_agent_brain_detects_architecture_planning_without_file_ops(self) -> None:
        from codegaai.core.agent_brain import decide_response, decision_guidance

        decision = decide_response(
            "Arac Sigorta ve Muayene Takip Sistemi gelistir. PHP Laravel + Flutter kullan. "
            "Clean Architecture uygula. Once analiz yap, sonra veritabani tasarimi olustur. "
            "Henuz kod yazma, sadece profesyonel proje mimarisi ve uygulanabilir gelistirme plani hazirla."
        )
        guidance = decision_guidance(decision)

        self.assertEqual(decision.intent, "architecture_planning")
        self.assertEqual(decision.response_style, "professional_architecture_plan")
        self.assertNotIn("file_ops", decision.needs_tools)
        self.assertIn("henuz kod yazma", guidance)
        self.assertIn("Laravel Architecture", guidance)
        self.assertIn("Security Plan", guidance)
        self.assertIn("users, vehicles, traffic_insurances", guidance)
        self.assertIn("Laravel Feature Test", guidance)

    def test_repository_contract_files_contain_vehicle_architecture_rules(self) -> None:
        for rel in [
            "AGENTS.md",
            "CODEGA_CORE.md",
            "CODEGA_RULES.md",
            "CODEGA_SKILLS/architect/SKILL.md",
        ]:
            text = (ROOT / rel).read_text(encoding="utf-8")
            self.assertIn("traffic_insurances", text, rel)
            self.assertIn("Laravel Sanctum", text, rel)
            self.assertIn("Flutter", text, rel)


if __name__ == "__main__":
    unittest.main()
