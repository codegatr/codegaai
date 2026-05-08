"""
Faz 1 duman testleri.

Sadece import + temel davranış doğrulaması yapar. AI modelleri
gerektirmez. CI'da güvenle çalışır.

Çalıştırmak için:
    python -m unittest tests.test_phase1
"""

from __future__ import annotations

import unittest


class TestPackageImports(unittest.TestCase):
    """Tüm public paketlerin import edilebilir olduğunu doğrula."""

    def test_top_level(self) -> None:
        import codegaai
        self.assertTrue(hasattr(codegaai, "__version__"))
        self.assertTrue(hasattr(codegaai, "__phase__"))
        self.assertEqual(codegaai.__repo__, "codegatr/codegaai")

    def test_subpackages(self) -> None:
        import codegaai.core           # noqa: F401
        import codegaai.modalities     # noqa: F401
        import codegaai.api            # noqa: F401
        import codegaai.api.routes     # noqa: F401
        import codegaai.ui             # noqa: F401
        import codegaai.utils          # noqa: F401


class TestConfig(unittest.TestCase):
    """Yapılandırma yükleme."""

    def test_get_config_returns_dict(self) -> None:
        from codegaai.config import get_config
        cfg = get_config()
        self.assertIsInstance(cfg, dict)

    def test_default_sections_present(self) -> None:
        from codegaai.config import get_config
        cfg = get_config(reload=True)
        for section in ("app", "server", "models", "hardware",
                        "memory", "learning", "update", "logging"):
            self.assertIn(section, cfg, f"Eksik bölüm: {section}")

    def test_get_paths(self) -> None:
        from codegaai.config import get_paths
        paths = get_paths()
        self.assertIn("data", paths)
        self.assertIn("models", paths)
        self.assertIn("memory", paths)


class TestLogger(unittest.TestCase):
    def test_get_logger(self) -> None:
        from codegaai.utils.logger import get_logger
        log = get_logger("test")
        self.assertEqual(log.name, "codegaai.test")
        # Hata vermemeli
        log.info("test mesajı")


class TestSystemCheck(unittest.TestCase):
    def test_run_all_checks(self) -> None:
        from codegaai.utils.system_check import run_all_checks
        report = run_all_checks()
        self.assertGreater(len(report.results), 0)
        for r in report.results:
            self.assertIn(r.status, ("ok", "warn", "fail", "info"))
            self.assertTrue(r.name)
            self.assertTrue(r.message)


class TestLauncherImport(unittest.TestCase):
    def test_launcher_imports(self) -> None:
        # launcher.py'ı modül olarak yükle
        import importlib.util
        from pathlib import Path

        launcher_path = Path(__file__).resolve().parent.parent / "launcher.py"
        self.assertTrue(launcher_path.exists())

        spec = importlib.util.spec_from_file_location("launcher", launcher_path)
        self.assertIsNotNone(spec)
        module = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
        spec.loader.exec_module(module)  # type: ignore[union-attr]

        # Beklenen fonksiyonlar (Faz 2 ile cmd_run yerine cmd_window/browser/serve)
        for fn in ("main", "cmd_version", "cmd_check", "cmd_init",
                   "cmd_window", "cmd_browser", "cmd_serve"):
            self.assertTrue(hasattr(module, fn), f"launcher.py içinde {fn} yok")


if __name__ == "__main__":
    unittest.main()
