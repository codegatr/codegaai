"""Chat UI contracts for history navigation and image attachments."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


class TestChatUiContracts(unittest.TestCase):

    def test_history_click_always_loads_chat(self) -> None:
        js = (ROOT / "codegaai" / "ui" / "web" / "js" / "chats.js").read_text(encoding="utf-8")

        self.assertIn("async function setActive(id)", js)
        self.assertNotIn("if (state.activeId === id) return", js)
        self.assertIn("API.chatsGet(id)", js)

    def test_chat_image_attachment_is_sent_to_vision(self) -> None:
        js = (ROOT / "codegaai" / "ui" / "web" / "js" / "chat.js").read_text(encoding="utf-8")

        self.assertIn("window._chatAttachedImage", js)
        self.assertIn("/api/vision/analyze", js)
        self.assertIn("FormData", js)
        self.assertIn("Ekli Gorsel Analizi", js)

    def test_primary_navigation_lives_in_top_bar(self) -> None:
        html = (ROOT / "codegaai" / "ui" / "web" / "index.html").read_text(encoding="utf-8")
        css = (ROOT / "codegaai" / "ui" / "web" / "css" / "layout.css").read_text(encoding="utf-8")

        self.assertIn('class="top-nav"', html)
        self.assertLess(html.index('class="top-nav"'), html.index('class="view active" data-view="chat"'))
        self.assertIn('class="top-nav__primary"', html)
        self.assertIn('class="top-nav__secondary"', html)
        self.assertIn('data-view="federation"', html)
        self.assertIn('data-view="system"', html)
        self.assertIn('.sidebar > .sidebar__nav', css)
        self.assertIn('display: none;', css)
        self.assertIn('.top-nav .nav-item', css)


if __name__ == "__main__":
    unittest.main()
