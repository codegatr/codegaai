from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class FederationPhpDirectAdminTests(unittest.TestCase):
    def test_php_coordinator_has_share_status_and_admin_tracking(self):
        index = read("deploy/federation-php/public/index.php")
        schema = read("deploy/federation-php/schema.sql")
        config = read("deploy/federation-php/public/config.sample.php")
        share = read("deploy/federation-php/public/share/index.php")
        status = read("deploy/federation-php/public/status/index.php")
        readme = read("deploy/federation-php/README.md")

        self.assertIn("APP_VERSION = '1.3.0'", index)
        self.assertIn("handle_share_create", index)
        self.assertIn("handle_share_view", index)
        self.assertIn("handle_status", index)
        self.assertIn("shared_chats", index)
        self.assertIn("federation_learning_audit", index)
        self.assertIn("autonomous_learning_audit", index)
        self.assertIn("/share/{slug}", readme)
        self.assertIn("DirectAdmin Layout", readme)
        self.assertIn("public_base_url", config)
        self.assertIn("share_retention_days", config)
        self.assertIn("CODEGA AI Share", share)
        self.assertIn("create_share", share)
        self.assertIn("view_share", share)
        self.assertIn("CODEGA AI Cloud Status", status)
        self.assertIn("CREATE TABLE IF NOT EXISTS shared_chats", schema)
        self.assertIn("CREATE TABLE IF NOT EXISTS federation_learning_audit", schema)

    def test_php_coordinator_keeps_raw_chats_out_of_federation_knowledge(self):
        index = read("deploy/federation-php/public/index.php")
        readme = read("deploy/federation-php/README.md")

        self.assertIn("Raw chat text is stored only when the user explicitly presses", readme)
        self.assertIn("Shared chats are separate from federation learning", readme)
        self.assertIn("never_shares", index)
        self.assertIn("raw chat text", index)


if __name__ == "__main__":
    unittest.main()
