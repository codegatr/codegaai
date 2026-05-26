from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class GrokMinimalHomeTests(unittest.TestCase):
    def test_home_is_single_centered_ai_prompt(self):
        html = read("codegaai/ui/web/index.html")
        css = read("codegaai/ui/web/css/claude_theme.css")

        self.assertIn("<h2 class=\"welcome__codex-title\">CODEGA AI</h2>", html)
        self.assertIn("Ne yapmak istiyorsun?", html)
        self.assertIn("CODEGA Grok Minimal Home (v4.5.4)", css)
        self.assertIn(".sidebar,", css)
        self.assertIn(".app-menubar,", css)
        self.assertIn("grid-template-columns: 1fr !important", css)
        self.assertIn("border-radius: 999px !important", css)
        self.assertIn(".chat-container:has(.welcome--command) .chat-input-bar", css)

    def test_capability_questions_are_answered_without_model_wait(self):
        jobs = read("codegaai/api/routes/jobs.py")
        engine = read("codegaai/core/engine.py")

        self.assertIn("def _quick_capability_response", jobs)
        self.assertIn("internet aramasını otomatik kullanırım", jobs)
        self.assertIn("kod moduna otomatik geçerim", jobs)
        self.assertIn("acquire(timeout=2.0)", engine)

    def test_version_bumped_to_454(self):
        init = read("codegaai/__init__.py")

        self.assertIn('__version__ = "4.5.4"', init)
        self.assertIn("Grok Minimal Home", init)
