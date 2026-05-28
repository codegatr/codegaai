from __future__ import annotations

import unittest
from pathlib import Path


class TestFrontierCapabilities(unittest.TestCase):
    def test_video_prompt_builds_multimodal_pipeline(self) -> None:
        from codegaai.core.frontier_capabilities import plan_capabilities

        plan = plan_capabilities("Sesli sinematik bir ürün tanıtım videosu üret")

        self.assertEqual(plan.task, "video")
        self.assertEqual(plan.reasoning_strategy, "storyboard_plan_consistency_check")
        self.assertIn("video", plan.modalities)
        self.assertIn("audio", plan.modalities)
        self.assertIn("video_generator", plan.tools)
        self.assertIn("cogvideox-5b", plan.video_pipeline["local_models"])
        self.assertTrue(plan.video_pipeline["requires_audio"])

    def test_federated_learning_policy_never_uploads_private_data(self) -> None:
        from codegaai.core.frontier_capabilities import federated_learning_policy

        policy = federated_learning_policy()

        self.assertEqual(policy["mode"], "opt_in_privacy_first")
        self.assertIn("raw chat text", policy["never_sends"])
        self.assertIn("API keys or tokens", policy["never_sends"])
        self.assertIn("sanitized public topic signals", policy["can_learn_from"])

    def test_reasoning_engine_includes_capability_plan(self) -> None:
        from codegaai.core.reasoning import ReasoningEngine

        messages, _ = ReasoningEngine.get().build_messages(
            "PHP ile stok takip programı yaz",
            history=[],
            system_prompt="Sen Codega AI'sın.",
        )

        self.assertIn("## Capability Plan", messages[0]["content"])
        self.assertIn("qwen_coder_or_strong_code_llm", messages[0]["content"])
        self.assertIn("react_tool_loop", messages[0]["content"])

    def test_chat_route_allows_dynamic_model_switching(self) -> None:
        src = Path("codegaai/api/routes/chat.py").read_text(encoding="utf-8")

        self.assertIn("Otomatik model geçişi", src)
        self.assertIn("ModelRouter.get().select_model", src)
        self.assertNotIn("Zaten yüklü model ASLA değiştirilmez", src)

    def test_video_route_exposes_planning_endpoint(self) -> None:
        src = Path("codegaai/api/routes/video.py").read_text(encoding="utf-8")

        self.assertIn('@router.post("/plan")', src)
        self.assertIn("capability_plan", src)

    def test_model_router_prefers_qwen3_coder_for_code(self) -> None:
        src = Path("codegaai/core/model_router.py").read_text(encoding="utf-8")

        self.assertIn('model_id="qwen3-coder-30b-a3b-q4_k_m"', src)
        self.assertIn("program yaz", src)


if __name__ == "__main__":
    unittest.main()
