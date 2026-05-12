"""Guardrails for GPU reporting and Windows no-AVX packaging."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


class TestGpuAndNoAvxBuild(unittest.TestCase):

    def test_windows_build_forces_source_noavx_llama(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "build-windows.yml").read_text(encoding="utf-8")

        self.assertIn("--no-binary llama-cpp-python", workflow)
        self.assertIn("GGML_AVX2=OFF", workflow)
        self.assertIn("GGML_FMA=OFF", workflow)
        self.assertNotIn("--prefer-binary", workflow)

    def test_gpu_status_separates_driver_torch_and_llama_cuda(self) -> None:
        gpu_py = (ROOT / "codegaai" / "api" / "routes" / "gpu.py").read_text(encoding="utf-8")

        self.assertIn("driver_cuda_available", gpu_py)
        self.assertIn("torch_cuda_available", gpu_py)
        self.assertIn("llama_supports_gpu_offload", gpu_py)
        self.assertIn("CPU/no-AVX build", gpu_py)

    def test_engine_status_tracks_actual_gpu_layers(self) -> None:
        engine_py = (ROOT / "codegaai" / "core" / "engine.py").read_text(encoding="utf-8")

        self.assertIn("n_gpu_layers: int = 0", engine_py)
        self.assertIn('"n_gpu_layers": s.n_gpu_layers', engine_py)
        self.assertIn("_detect_free_vram_gb", engine_py)
        self.assertIn("llama_supports_gpu_offload", engine_py)

    def test_frozen_app_does_not_try_codegaai_exe_as_pip(self) -> None:
        startup_py = (ROOT / "codegaai" / "core" / "startup.py").read_text(encoding="utf-8")
        engine_py = (ROOT / "codegaai" / "core" / "engine.py").read_text(encoding="utf-8")

        self.assertIn('getattr(sys, "frozen", False)', startup_py)
        self.assertIn("portable uygulama pip ile yerinde onarilamaz", startup_py)
        self.assertIn("no-AVX Windows paketini kurun", engine_py)
        self.assertNotIn("--prefer-binary", startup_py)

    def test_system_page_does_not_abort_startup_requests(self) -> None:
        system_js = (ROOT / "codegaai" / "ui" / "web" / "js" / "system.js").read_text(encoding="utf-8")

        self.assertIn("timeoutMs = 45000", system_js)
        self.assertIn("Promise.race", system_js)
        self.assertIn("Sunucu hazirlaniyor", system_js)
        self.assertNotIn("ctrl.abort()", system_js)

    def test_cpu_package_disables_gpu_button_and_cuda_workflow_exists(self) -> None:
        system_js = (ROOT / "codegaai" / "ui" / "web" / "js" / "system.js").read_text(encoding="utf-8")
        cuda_workflow = (ROOT / ".github" / "workflows" / "build-windows-cuda.yml").read_text(encoding="utf-8")

        self.assertIn("CUDA paket gerekir", system_js)
        self.assertIn("windows-cuda paketi", system_js)
        self.assertIn("Windows CUDA Build", cuda_workflow)
        self.assertIn("whl/cu124", cuda_workflow)
        self.assertIn("endsWith(github.ref_name, '-cuda')", cuda_workflow)
        self.assertIn("os.add_dll_directory", cuda_workflow)

    def test_engine_adds_windows_cuda_dll_paths(self) -> None:
        engine_py = (ROOT / "codegaai" / "core" / "engine.py").read_text(encoding="utf-8")

        self.assertIn("_prepare_windows_cuda_dll_paths", engine_py)
        self.assertIn("os.add_dll_directory", engine_py)
        self.assertIn('base / "torch" / "lib"', engine_py)

    def test_llama_load_has_native_crash_preflight(self) -> None:
        engine_py = (ROOT / "codegaai" / "core" / "engine.py").read_text(encoding="utf-8")
        launcher_py = (ROOT / "launcher.py").read_text(encoding="utf-8")

        self.assertIn("_native_preflight_llama", engine_py)
        self.assertIn("CODEGA_SKIP_NATIVE_PREFLIGHT", engine_py)
        self.assertIn("Ana uygulamanin kapanmamasi icin model yukleme engellendi", engine_py)
        self.assertIn("--native-preflight-llama", launcher_py)
        self.assertIn("cmd_native_preflight_llama", launcher_py)


if __name__ == "__main__":
    unittest.main()
