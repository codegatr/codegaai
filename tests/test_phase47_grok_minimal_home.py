from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class MinimalHomeNavigationTests(unittest.TestCase):
    def test_home_keeps_history_and_settings_without_clutter(self):
        html = read("codegaai/ui/web/index.html")
        css = read("codegaai/ui/web/css/claude_theme.css")

        self.assertIn("<h2 class=\"welcome__codex-title\">CODEGA AI</h2>", html)
        self.assertIn("Ne yapmak istiyorsun?", html)
        self.assertIn("CODEGA Instant Answer Guard (v4.5.9)", css)
        self.assertIn("minimal-settings-btn", html)
        self.assertIn("grid-template-columns: 286px 1fr !important", css)
        self.assertIn("grid-template-areas: \"sidebar main\" !important", css)
        self.assertIn(".sidebar {", css)
        self.assertIn("display: flex !important", css)
        self.assertIn(".app-menubar,", css)
        self.assertIn(".sidebar__nav,", css)
        self.assertIn(".minimal-top-actions", css)
        self.assertIn("border-radius: 999px !important", css)
        self.assertIn(".chat-container:has(.welcome--command) .chat-input-bar", css)

    def test_capability_and_social_turns_are_answered_without_model_wait(self):
        jobs = read("codegaai/api/routes/jobs.py")
        engine = read("codegaai/core/engine.py")
        chat_js = read("codegaai/ui/web/js/chat.js")

        self.assertIn("def _quick_capability_response", jobs)
        self.assertIn("internet aramasını otomatik kullanırım", jobs)
        self.assertIn("kod moduna otomatik geçerim", jobs)
        self.assertIn("acquire(timeout=2.0)", engine)
        self.assertIn("function quickLocalSocialResponse", chat_js)
        self.assertIn("codega-instant", chat_js)

    def test_recommended_model_downloads_automatically(self):
        chat_js = read("codegaai/ui/web/js/chat.js")
        server = read("codegaai/api/server.py")
        config = read("codegaai/config.py")

        self.assertIn("auto_download_model", config)
        self.assertIn("download_llm_async(rec.model_id)", server)
        self.assertIn("llm-auto-dl", server)
        self.assertIn("/api/models/${encodeURIComponent(modelId)}/download", chat_js)
        self.assertIn("function _pollDownloadThenWarm", chat_js)

    def test_version_bumped_to_455(self):
        init = read("codegaai/__init__.py")

        self.assertIn('__version__ = "4.5.9"', init)
        self.assertIn("Action-First Delivery Guard", init)
