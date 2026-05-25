"""Device-aware model selection contracts."""

from __future__ import annotations

import unittest

from codegaai.core.device_model_policy import DeviceProfile, recommend_llm_model


class DeviceModelPolicyTests(unittest.TestCase):
    def test_cpu_or_low_memory_devices_prefer_small_qwen3(self) -> None:
        profile = DeviceProfile(os_name="Windows", arch="x86_64", ram_gb=8, vram_gb=0, backend="cpu")

        rec = recommend_llm_model(profile, downloaded_ids={"qwen3-4b-q4_k_m", "qwen3-8b-q4_k_m"})

        self.assertEqual(rec.model_id, "qwen3-4b-q4_k_m")
        self.assertEqual(rec.tier, "balanced")

    def test_six_gb_gpu_prefers_fast_4b_to_avoid_chat_timeouts(self) -> None:
        profile = DeviceProfile(os_name="Windows", arch="x86_64", ram_gb=24, vram_gb=6, backend="cuda")

        rec = recommend_llm_model(profile, downloaded_ids={"qwen3-4b-q4_k_m", "qwen3-8b-q4_k_m"})

        self.assertEqual(rec.model_id, "qwen3-4b-q4_k_m")
        self.assertIn("6 GB", rec.reason)

    def test_apple_silicon_with_large_unified_memory_can_use_8b(self) -> None:
        profile = DeviceProfile(os_name="Darwin", arch="arm64", ram_gb=32, vram_gb=0, backend="metal")

        rec = recommend_llm_model(profile, downloaded_ids={"qwen3-4b-q4_k_m", "qwen3-8b-q4_k_m"})

        self.assertEqual(rec.model_id, "qwen3-8b-q4_k_m")
        self.assertEqual(rec.tier, "strong")

    def test_high_memory_workstation_can_pick_new_qwen3_moe_models(self) -> None:
        profile = DeviceProfile(os_name="Linux", arch="x86_64", ram_gb=96, vram_gb=24, backend="cuda")

        rec = recommend_llm_model(
            profile,
            downloaded_ids={
                "qwen3-4b-q4_k_m",
                "qwen3-8b-q4_k_m",
                "qwen3-30b-a3b-q4_k_m",
            },
            task="code",
        )

        self.assertEqual(rec.model_id, "qwen3-30b-a3b-q4_k_m")


if __name__ == "__main__":
    unittest.main()
