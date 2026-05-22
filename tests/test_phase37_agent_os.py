"""v4.3.7 agent operating system contract tests."""

from __future__ import annotations

import unittest

from codegaai.core.agent_platform import agent_os_manifest, plan_agent_task, platform_status


class TestAgentOSContract(unittest.TestCase):
    def test_manifest_lists_user_required_layers(self) -> None:
        manifest = agent_os_manifest()
        layer_ids = {layer["id"] for layer in manifest["layers"]}
        for required in {
            "multi_model",
            "memory",
            "tools",
            "planner_executor",
            "specialists",
            "project_brain",
            "test_loop",
            "sandbox_vm",
            "multimodal",
            "auto_deploy",
            "ai_os",
        }:
            self.assertIn(required, layer_ids)
        self.assertTrue(manifest["safety_contract"]["secrets_are_redacted"])

    def test_codega_project_uses_isolated_project_brain(self) -> None:
        plan = plan_agent_task("CODEGA AI icin model router ve planner executor omurgasini duzelt")
        data = plan.to_dict()
        self.assertEqual(data["project_brain"]["scope"], "CODEGA AI")
        self.assertIn("project:CODEGA AI", data["project_brain"]["memory_sources"])
        self.assertEqual(data["specialist"], "ai_system_architect")
        self.assertIn("planner_executor", data)
        self.assertTrue(data["learning_policy"])

    def test_multimodal_and_audio_providers_are_registered(self) -> None:
        status = platform_status()
        provider_ids = {provider["id"] for provider in status["providers"]}
        self.assertIn("local:vision", provider_ids)
        self.assertIn("local:whisper", provider_ids)
        self.assertIn("local:bge-m3", provider_ids)
        self.assertIn("agent_os", status)


if __name__ == "__main__":
    unittest.main()
