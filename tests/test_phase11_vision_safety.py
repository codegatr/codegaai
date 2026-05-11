"""Vision loading safety contracts."""

from __future__ import annotations

import sys
import types
import unittest
from unittest.mock import patch


class TestVisionSafety(unittest.TestCase):

    def setUp(self) -> None:
        from codegaai.core.vision_engine import VisionEngine
        VisionEngine._instance = None

    def tearDown(self) -> None:
        from codegaai.core.vision_engine import VisionEngine
        VisionEngine._instance = None

    def test_cpu_load_is_blocked_when_ram_is_low(self) -> None:
        from codegaai.core.vision_engine import VisionEngine

        fake_torch = types.SimpleNamespace(
            cuda=types.SimpleNamespace(is_available=lambda: False),
            float16="float16",
            float32="float32",
        )
        fake_psutil = types.SimpleNamespace(
            virtual_memory=lambda: types.SimpleNamespace(available=3 * 1024**3)
        )

        with patch.dict(sys.modules, {"torch": fake_torch, "psutil": fake_psutil}):
            engine = VisionEngine.get()
            ok, reason = engine.can_load("moondream2")

        self.assertFalse(ok)
        self.assertIn("bos RAM gerekir", reason)

    def test_load_sets_error_instead_of_starting_unsafe_load(self) -> None:
        from codegaai.core.vision_engine import VisionEngine

        fake_torch = types.SimpleNamespace(
            cuda=types.SimpleNamespace(is_available=lambda: False),
            float16="float16",
            float32="float32",
        )
        fake_psutil = types.SimpleNamespace(
            virtual_memory=lambda: types.SimpleNamespace(available=3 * 1024**3)
        )

        with patch.dict(sys.modules, {"torch": fake_torch, "psutil": fake_psutil}):
            engine = VisionEngine.get()
            with self.assertRaises(RuntimeError):
                engine.load("moondream2")

        self.assertEqual(engine.status["state"], "error")
        self.assertEqual(engine.status["model_id"], "moondream2")
        self.assertIn("bos RAM gerekir", engine.status["error"])


if __name__ == "__main__":
    unittest.main()
