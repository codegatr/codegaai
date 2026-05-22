"""v4.3.8 macOS Apple Silicon, federation API and README tests."""

from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class TestMacOSFederationReadme(unittest.TestCase):
    def test_macos_workflow_targets_apple_silicon(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "build-macos.yml").read_text(encoding="utf-8")
        self.assertIn("runs-on: macos-15", workflow)
        self.assertIn('test "$(uname -m)" = "arm64"', workflow)
        self.assertIn("macos-arm64.zip", workflow)

    def test_federation_php_exposes_metrics_and_prune(self) -> None:
        php = (ROOT / "deploy" / "federation-php" / "public" / "index.php").read_text(encoding="utf-8")
        self.assertIn("function coordinator_metrics", php)
        self.assertIn("function enforce_rate_limit", php)
        self.assertIn("$route === '/metrics'", php)
        self.assertIn("$route === '/admin/prune'", php)
        self.assertIn("quality DECIMAL", php)

    def test_readme_documents_current_agent_os_capabilities(self) -> None:
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("codega_logo.png", readme)
        self.assertIn("img.shields.io", readme)
        self.assertIn("Agent OS", readme)
        self.assertIn("macOS Apple Silicon", readme)
        self.assertIn("/api/federation/metrics", readme)
        self.assertIn("/api/orchestrate/agent-os", readme)
        self.assertIn("MIT lisansı", readme)


if __name__ == "__main__":
    unittest.main()
