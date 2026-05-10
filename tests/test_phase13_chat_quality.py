"""Chat quality guardrails."""

from __future__ import annotations

import unittest


class TestChatIntentGuardrails(unittest.TestCase):

    def test_self_reference_does_not_trigger_web_search(self) -> None:
        from codegaai.api.routes.jobs import _needs_web_search

        self.assertFalse(_needs_web_search("Biraz daha iyi misin son güncellemeler sonrası?"))
        self.assertFalse(_needs_web_search("Sen Windows'dan bahsetmedim ki senden bahsettim."))

    def test_explicit_web_search_still_triggers(self) -> None:
        from codegaai.api.routes.jobs import _needs_web_search

        self.assertTrue(_needs_web_search("İnternette ara: Qwen 2.5 güncel benchmark"))
        self.assertTrue(_needs_web_search("https://example.com sayfasını oku"))

    def test_recent_focus_marks_self_reference(self) -> None:
        from codegaai.api.routes.jobs import _build_recent_focus

        focus = _build_recent_focus(
            [
                {"role": "user", "content": "Peki seni nasıl düzeltebilirim?"},
                {"role": "assistant", "content": "Yanlış anladım."},
            ],
            "Biraz daha iyi misin son güncellemeler sonrası?",
        )

        self.assertIn("CODEGA AI", focus)
        self.assertIn("Konuyu Windows", focus)


if __name__ == "__main__":
    unittest.main()
