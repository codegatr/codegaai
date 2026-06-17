from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class MinimalAutoIntentTests(unittest.TestCase):
    def test_social_chat_bypasses_local_model_generation(self):
        jobs = read("codegaai/api/routes/jobs.py")

        self.assertIn("def _quick_social_response", jobs)
        self.assertIn('_is_social_chat(job.message) and msg_len < 60', jobs)
        self.assertIn("İyi geceler", jobs)
        self.assertIn("store.add_message(job.chat_id, \"assistant\", answer)", jobs)

    def test_chat_auto_routes_image_generation_without_manual_mode_buttons(self):
        chat = read("codegaai/ui/web/js/chat.js")
        css = read("codegaai/ui/web/css/claude_theme.css")

        self.assertIn("looksLikeImageGeneration", chat)
        self.assertIn("routeAutomaticIntent(payload)", chat)
        self.assertIn('[data-view="image"]', chat)
        self.assertIn("image-generate-btn", chat)
        self.assertIn("FIRST_TOKEN_MS = 25_000", chat)
        self.assertIn("MAX_MS = 90_000", chat)
        self.assertIn(".view[data-view=\"chat\"] .toolbar-actions", css)
        self.assertIn(".view[data-view=\"chat\"] #speed-toggle", css)
        self.assertIn("display: none !important", css)

    def test_version_bumped_to_454(self):
        init = read("codegaai/__init__.py")

        self.assertIn('__version__ = "4.5.8"', init)
        self.assertIn("Action-First Delivery Guard", init)
