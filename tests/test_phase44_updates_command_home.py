from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class SilentUpdatesCommandHomeTests(unittest.TestCase):
    def test_updater_polls_silently_every_ten_seconds(self):
        js = read("codegaai/ui/web/js/updater.js")
        api = read("codegaai/api/routes/updater.py")

        self.assertIn("function silentCheck()", js)
        self.assertIn("setInterval(silentCheck, 10 * 1000)", js)
        self.assertIn("Yeni CODEGA AI sürümü hazır", js)
        self.assertIn("check_interval_seconds:10", js)
        self.assertIn("check_interval_seconds: int = 10", api)
        self.assertIn("time.sleep(max(10, interval_seconds))", api)

    def test_updater_understands_macos_dmg_and_ready_progress(self):
        core = read("codegaai/core/updater.py")
        api = read("codegaai/api/routes/updater.py")

        self.assertIn("MACOS_ASSET_PATTERN", core)
        self.assertIn("macos-arm64\\.dmg", core)
        self.assertIn("asset_name.lower().endswith(\".dmg\")", core)
        self.assertIn('public_status = "completed" if state == "ready" else state', api)
        self.assertIn('if d.get("state") != "ready"', api)

    def test_command_home_has_modern_runtime_panel(self):
        html = read("codegaai/ui/web/index.html")
        css = read("codegaai/ui/web/css/claude_theme.css")

        self.assertIn("welcome-stage", html)
        self.assertIn("welcome-console", html)
        self.assertIn("10 sn sessiz kontrol", html)
        self.assertIn("Ne yapmak istiyorsun?", html)
        self.assertIn("CODEGA Command Home (v4.5.1)", css)
        self.assertIn("@keyframes codegaScan", css)

    def test_version_bumped_to_451(self):
        init = read("codegaai/__init__.py")

        self.assertIn('__version__ = "4.5.20"', init)
        self.assertIn("Fast Path Recovery", init)
