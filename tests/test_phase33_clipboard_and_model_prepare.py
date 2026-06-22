from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


class ClipboardAndModelPrepareTests(unittest.TestCase):
    def test_chat_accepts_clipboard_screenshots(self) -> None:
        js = read("codegaai/ui/web/js/chat.js")
        self.assertIn("handleClipboardImagePaste", js)
        self.assertIn("clipboardData", js)
        self.assertIn("clipboard-screenshot-", js)
        self.assertIn("window.attachChatImage", js)

    def test_chat_file_picker_uses_same_attachment_path(self) -> None:
        vision = read("codegaai/ui/web/js/vision.js")
        self.assertIn("window.attachChatImage(file)", vision)

    def test_model_cards_prepare_download_and_load(self) -> None:
        system = read("codegaai/ui/web/js/system.js")
        self.assertIn("prepareModel", system)
        self.assertIn("İndir + Yükle", system)
        self.assertIn("{loadAfter: true}", system)
        self.assertIn("if (!r.ok)", system)
        self.assertIn("data.detail || data.error", system)
        self.assertIn("`/api/models/${id}/unload`", system)


if __name__ == "__main__":
    unittest.main()
