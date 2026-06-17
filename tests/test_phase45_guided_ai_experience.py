from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class GuidedAIExperienceTests(unittest.TestCase):
    def test_chat_surface_has_ai_state_prompt_guidance_and_disclaimer(self):
        html = read("codegaai/ui/web/index.html")

        self.assertIn("ai-state-rail", html)
        self.assertIn("prompt-starter-row", html)
        self.assertIn("CODEGA AI hata yapabilir", html)
        self.assertIn("Dosya analiz", html)
        self.assertIn("Hata çöz", html)

    def test_chat_js_exposes_output_control_and_status_states(self):
        js = read("codegaai/ui/web/js/chat.js")

        self.assertIn("renderOutputActions", js)
        self.assertIn("copyMessage", js)
        self.assertIn("regenerateFromMessage", js)
        self.assertIn("editPromptForMessage", js)
        self.assertIn("shareMessage", js)
        self.assertIn("setAIState", js)
        self.assertIn("Yanıt yazılıyor", js)
        self.assertIn("Komut taslağı hazır", js)

    def test_guided_ai_css_has_skeleton_states_and_action_buttons(self):
        css = read("codegaai/ui/web/css/claude_theme.css")

        self.assertIn(".ai-state-rail", css)
        self.assertIn(".prompt-starter", css)
        self.assertIn(".ai-skeleton", css)
        self.assertIn("@keyframes skeletonFlow", css)
        self.assertIn(".message__actions", css)
        self.assertIn(".message-confidence", css)

    def test_version_bumped_to_454(self):
        init = read("codegaai/__init__.py")

        self.assertIn('__version__ = "4.5.8"', init)
        self.assertIn("Action-First Delivery Guard", init)
