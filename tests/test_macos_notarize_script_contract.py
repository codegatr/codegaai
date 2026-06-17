from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class MacOSNotarizeScriptContractTests(unittest.TestCase):
    def _script(self) -> str:
        return (ROOT / "apps" / "codegaai-desktop" / "scripts" / "notarize-macos.cjs").read_text(
            encoding="utf-8"
        )

    def test_macos_notarization_skips_unsigned_builds(self):
        script = self._script()

        self.assertIn('process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false"', script)
        self.assertIn("macOS notarization skipped for unsigned build.", script)

    def test_macos_notarization_missing_credentials_do_not_fail_release_build(self):
        script = self._script()

        self.assertIn("macOS notarization skipped; missing credentials:", script)
        self.assertNotIn("throw new Error(`macOS notarization credentials are missing", script)


if __name__ == "__main__":
    unittest.main()
