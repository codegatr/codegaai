import unittest

from codegaai.core.agent_platform import plan_agent_task, platform_status, redact_secrets


class TestAgentPlatformCore(unittest.TestCase):
    def test_php_directadmin_routes_to_specialist(self):
        plan = plan_agent_task("PHP 8.3 DirectAdmin hosting icin MySQL hata loglarini incele")
        data = plan.to_dict()
        self.assertEqual(data["specialist"], "php_directadmin")
        self.assertIn("openai:gpt-5", data["provider_chain"])
        self.assertIn("recall", data["tools"])
        self.assertIn("terminal", data["approval_required"])

    def test_secret_redaction_masks_tokens(self):
        redacted, notes = redact_secrets(
            "Github token ghp_1234567890abcdefghijklmnop ve hf_1234567890abcdefghijklmnop"
        )
        self.assertNotIn("ghp_1234567890abcdefghijklmnop", redacted)
        self.assertNotIn("hf_1234567890abcdefghijklmnop", redacted)
        self.assertIn("[REDACTED_SECRET]", redacted)
        self.assertTrue(notes)

    def test_vision_plan_adds_image_tools(self):
        plan = plan_agent_task("Bu ekran goruntusunu analiz eder misin?")
        self.assertIn("analyze_image", plan.tools)
        self.assertIn("local:vision", plan.provider_chain)

    def test_platform_status_lists_required_parts(self):
        status = platform_status()
        provider_ids = {p["id"] for p in status["providers"]}
        specialist_ids = {s["id"] for s in status["specialists"]}
        self.assertIn("openai:gpt-5", provider_ids)
        self.assertIn("anthropic:claude", provider_ids)
        self.assertIn("google:gemini", provider_ids)
        self.assertIn("local:qwen-coder", provider_ids)
        self.assertIn("php_directadmin", specialist_ids)
        self.assertIn("codebase_agent", specialist_ids)
        self.assertIn("github_push", status["tool_policy"]["approval_required_tools"])


if __name__ == "__main__":
    unittest.main()
