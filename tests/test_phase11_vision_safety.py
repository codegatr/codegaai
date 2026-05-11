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

    def test_cpu_load_is_blocked_by_default(self) -> None:
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
        self.assertIn("CPU vision yuklemesi engellendi", reason)

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
        self.assertIn("CPU vision yuklemesi engellendi", engine.status["error"])

    def test_unsafe_cpu_modal_loads_have_guards(self) -> None:
        from pathlib import Path

        root = Path(__file__).resolve().parent.parent
        image = (root / "codegaai" / "core" / "image_engine.py").read_text(encoding="utf-8")
        video = (root / "codegaai" / "core" / "video_engine.py").read_text(encoding="utf-8")
        audio = (root / "codegaai" / "core" / "audio_engine.py").read_text(encoding="utf-8")

        self.assertIn("CODEGA_ALLOW_CPU_DIFFUSERS", image)
        self.assertIn("CPU diffusers yuklemesi engellendi", image)
        self.assertIn("CODEGA_ALLOW_CPU_DIFFUSERS", video)
        self.assertIn("CPU diffusers yuklemesi engellendi", video)
        self.assertIn("CODEGA_ALLOW_CPU_XTTS", audio)
        self.assertIn("CPU XTTS yuklemesi engellendi", audio)

    def test_auto_vision_paths_return_errors_instead_of_crashing(self) -> None:
        from pathlib import Path

        root = Path(__file__).resolve().parent.parent
        route = (root / "codegaai" / "api" / "routes" / "vision.py").read_text(encoding="utf-8")
        analyzer = (root / "codegaai" / "core" / "video_analyzer.py").read_text(encoding="utf-8")

        self.assertIn("raise HTTPException(409, str(exc))", route)
        self.assertIn("except RuntimeError as exc", analyzer)


if __name__ == "__main__":
    unittest.main()
