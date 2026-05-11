from __future__ import annotations

import unittest
from pathlib import Path


class TestWindowedBuild(unittest.TestCase):
    def test_pyinstaller_build_hides_console_window(self) -> None:
        spec = Path("build/codegaai.spec").read_text(encoding="utf-8")

        self.assertIn("console=False", spec)
        self.assertNotIn("console=True", spec)

    def test_frozen_logger_handles_missing_stderr(self) -> None:
        logger_src = Path("codegaai/utils/logger.py").read_text(encoding="utf-8")

        self.assertIn("logging.NullHandler()", logger_src)
        self.assertIn('getattr(sys, "stderr", None)', logger_src)


if __name__ == "__main__":
    unittest.main()
