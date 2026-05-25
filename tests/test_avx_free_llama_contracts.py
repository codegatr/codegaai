"""Contracts that keep Windows llama.cpp builds safe on non-AVX2 CPUs."""

from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class TestAvxFreeLlamaContracts(unittest.TestCase):
    def test_runtime_guidance_does_not_recommend_abetlen_cpu_wheel(self) -> None:
        engine = (ROOT / "codegaai" / "core" / "engine.py").read_text(encoding="utf-8")
        repair = (ROOT / "codegaai" / "api" / "routes" / "repair.py").read_text(encoding="utf-8")
        fix_bat = (ROOT / "build" / "fix_llama.bat").read_text(encoding="utf-8")

        self.assertNotIn("abetlen.github.io/llama-cpp-python/whl/cpu", engine)
        self.assertNotIn("abetlen.github.io/llama-cpp-python/whl/cpu", repair)
        self.assertNotIn("abetlen.github.io/llama-cpp-python/whl/cpu", fix_bat)

    def test_repair_route_installs_llama_cpp_from_avx_free_source_first(self) -> None:
        repair = (ROOT / "codegaai" / "api" / "routes" / "repair.py").read_text(encoding="utf-8")

        self.assertIn("--no-binary", repair)
        self.assertIn("llama-cpp-python", repair)
        self.assertIn("-DGGML_AVX=OFF", repair)
        self.assertIn("-DGGML_AVX2=OFF", repair)
        self.assertIn("-DGGML_F16C=OFF", repair)
        self.assertIn("-DGGML_FMA=OFF", repair)

    def test_windows_workflow_fails_instead_of_falling_back_to_avx_wheel(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "build-windows.yml").read_text(encoding="utf-8-sig")

        self.assertIn("--no-binary llama-cpp-python", workflow)
        self.assertIn("-DGGML_AVX=OFF", workflow)
        self.assertIn("-DGGML_AVX2=OFF", workflow)
        self.assertNotIn("--prefer-binary", workflow)
        self.assertNotIn("Son care: abetlen wheel", workflow)

    def test_model_load_route_surfaces_avx_error_guidance(self) -> None:
        models = (ROOT / "codegaai" / "api" / "routes" / "models.py").read_text(encoding="utf-8")

        self.assertIn("except OSError as exc", models)
        self.assertIn('engine.status.get("error")', models)
        self.assertIn("0xc000001d", models)
        self.assertIn("Otomatik Onar", models)


if __name__ == "__main__":
    unittest.main()
