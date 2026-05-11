"""Updater release selection should not depend on GitHub's latest pointer."""

from __future__ import annotations

import unittest


class TestUpdaterReleaseSelection(unittest.TestCase):

    def test_selects_highest_windows_cpu_release(self) -> None:
        from codegaai.core.updater import Updater

        releases = [
            {
                "tag_name": "v1.6.0",
                "assets": [{"name": "codegaai-v1.6.0-windows-cpu.zip"}],
            },
            {
                "tag_name": "v3.6.8-cuda",
                "assets": [{"name": "codegaai-v3.6.8-cuda-windows-cuda.zip"}],
            },
            {
                "tag_name": "v3.6.7",
                "assets": [{"name": "codegaai-v3.6.7-windows-cpu.zip"}],
            },
            {
                "tag_name": "v3.6.8",
                "assets": [{"name": "codegaai-v3.6.8-windows-cpu.zip"}],
            },
        ]

        selected = Updater._select_latest_release(releases)
        self.assertIsNotNone(selected)
        self.assertEqual(selected["tag_name"], "v3.6.8")

    def test_ignores_releases_without_cpu_asset(self) -> None:
        from codegaai.core.updater import Updater

        releases = [
            {"tag_name": "v3.7.0", "assets": []},
            {
                "tag_name": "v3.6.9-cuda",
                "assets": [{"name": "codegaai-v3.6.9-cuda-windows-cuda.zip"}],
            },
        ]

        self.assertIsNone(Updater._select_latest_release(releases))


if __name__ == "__main__":
    unittest.main()
