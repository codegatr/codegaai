from pathlib import Path
import unittest

from codegaai.api.routes.updater import _is_newer_version


ROOT = Path(__file__).resolve().parents[1]


class TestWorkbenchUIPolish(unittest.TestCase):
    def test_sidebar_phase_is_dynamic(self):
        html = (ROOT / "codegaai/ui/web/index.html").read_text(encoding="utf-8")
        self.assertIn('id="phase-text"', html)
        self.assertNotIn("Faz 8 / 8", html)

    def test_welcome_links_point_to_existing_views(self):
        html = (ROOT / "codegaai/ui/web/index.html").read_text(encoding="utf-8")
        self.assertIn("[data-view=\\'system\\']", html)
        self.assertIn("[data-view=\\'settings\\']", html)
        self.assertIn("[data-view=\\'autolearn\\']", html)
        self.assertNotIn("Gelişmiş Özellikler", html)

    def test_update_badge_has_stale_version_guard(self):
        js = (ROOT / "codegaai/ui/web/js/updater.js").read_text(encoding="utf-8")
        self.assertIn("function isNewer", js)
        self.assertIn("setUpdateBadge(show", js)
        self.assertIn("init };", js)
        self.assertTrue(_is_newer_version("4.3.6", "4.3.5"))
        self.assertFalse(_is_newer_version("4.3.5", "4.3.5"))
        self.assertFalse(_is_newer_version("4.3.4", "4.3.5"))

    def test_chat_workbench_css_is_wide_and_top_aligned(self):
        css = (ROOT / "codegaai/ui/web/css/claude_theme.css").read_text(encoding="utf-8")
        self.assertIn("CODEGA AI workbench polish", css)
        self.assertIn("justify-content: flex-start", css)
        self.assertIn("1120px", css)


if __name__ == "__main__":
    unittest.main()
