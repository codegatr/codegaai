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
        self.assertIn("CODEGA_ALLOW_LOW_VRAM_DIFFUSERS", image)
        self.assertIn("Uygulamanin kapanmamasi icin yukleme engellendi", image)
        self.assertIn("CODEGA_ALLOW_CPU_DIFFUSERS", video)
        self.assertIn("CPU diffusers yuklemesi engellendi", video)
        self.assertIn("CODEGA_ALLOW_LOW_VRAM_DIFFUSERS", video)
        self.assertIn("CODEGA_ALLOW_CPU_XTTS", audio)
        self.assertIn("CPU XTTS yuklemesi engellendi", audio)

    def test_model_load_route_has_video_branch_and_ui_surfaces_errors(self) -> None:
        from pathlib import Path

        root = Path(__file__).resolve().parent.parent
        route = (root / "codegaai" / "api" / "routes" / "models.py").read_text(encoding="utf-8")
        system_js = (root / "codegaai" / "ui" / "web" / "js" / "system.js").read_text(encoding="utf-8")
        system_route = (root / "codegaai" / "api" / "routes" / "system.py").read_text(encoding="utf-8")

        self.assertIn("registry.get_video_spec(model_id)", route)
        self.assertIn("VideoEngine.get()", route)
        self.assertIn("Yukleme engellendi", system_js)
        self.assertIn("v.error || v.tts?.error || v.asr?.error", system_js)
        self.assertIn('"error": img_status.get("error")', system_route)
        self.assertIn('"error": video_status.get("error")', system_route)

    def test_video_engine_blocks_low_vram_without_pipeline_import(self) -> None:
        from codegaai.core.video_engine import VideoEngine

        VideoEngine._instance = None

        spec = types.SimpleNamespace(
            id="cogvideox-2b",
            pipeline="cogvideox",
            mode="t2v",
            vram_gb=12.0,
        )
        fake_registry = types.SimpleNamespace(
            get_llm_spec=lambda _id: None,
            get_embedding_spec=lambda _id: None,
            get_image_spec=lambda _id: None,
            get_audio_spec=lambda _id: None,
            get_video_spec=lambda _id: spec,
            is_video_downloaded=lambda _id: True,
            video_dir_path=lambda _id: ".",
        )
        fake_torch = types.SimpleNamespace(
            cuda=types.SimpleNamespace(is_available=lambda: True),
            bfloat16="bfloat16",
            float32="float32",
        )

        with patch("codegaai.core.video_engine.ModelRegistry.get", return_value=fake_registry), \
             patch("codegaai.core.video_engine.VideoEngine._detect_cuda_vram_gb", return_value=(True, 6.0)), \
             patch.dict(sys.modules, {"torch": fake_torch}):
            with self.assertRaises(RuntimeError) as ctx:
                VideoEngine.get().load("cogvideox-2b")

        self.assertIn("VRAM gerekir", str(ctx.exception))
        self.assertEqual(VideoEngine.get().status["state"], "error")

    def test_auto_vision_paths_return_errors_instead_of_crashing(self) -> None:
        from pathlib import Path

        root = Path(__file__).resolve().parent.parent
        route = (root / "codegaai" / "api" / "routes" / "vision.py").read_text(encoding="utf-8")
        analyzer = (root / "codegaai" / "core" / "video_analyzer.py").read_text(encoding="utf-8")

        self.assertIn("raise HTTPException(409, str(exc))", route)
        self.assertIn("except RuntimeError as exc", analyzer)


if __name__ == "__main__":
    unittest.main()
