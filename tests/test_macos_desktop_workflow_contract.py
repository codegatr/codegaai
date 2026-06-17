from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class MacOSDesktopWorkflowContractTests(unittest.TestCase):
    def test_desktop_macos_workflow_has_unsigned_fallback(self):
        workflow = (ROOT / ".github" / "workflows" / "build-codegaai-desktop-macos.yml").read_text(
            encoding="utf-8"
        )

        self.assertIn("Detect Apple release credentials", workflow)
        self.assertIn("apple_credentials.outputs.available", workflow)
        self.assertIn("Build signed macOS app", workflow)
        self.assertIn("Build unsigned macOS app", workflow)
        self.assertIn("CSC_IDENTITY_AUTO_DISCOVERY", workflow)
        self.assertIn("unset CSC_LINK CSC_KEY_PASSWORD", workflow)
        self.assertIn("Verify unsigned macOS artifact", workflow)
        self.assertNotIn("Refusing to publish an unsigned macOS application.", workflow)


if __name__ == "__main__":
    unittest.main()
