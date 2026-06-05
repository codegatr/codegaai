from __future__ import annotations

import unittest
from pathlib import Path

from codegaai.core.action_delivery import build_delivery_artifact, should_deliver_project


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class ActionDeliveryTests(unittest.TestCase):
    def test_project_zip_request_is_caught_before_chat_model(self):
        message = (
            "Arac Kiralama firmasi icin ozel bir tasarim yapacagiz. "
            "PHP 8.3 ve uzeri destekli veritabanli online kiralama sistemi "
            "olustur ve bana veritabani ve dosyalari zip olarak ver."
        )

        artifact = build_delivery_artifact(message)

        self.assertIsNotNone(artifact)
        assert artifact is not None
        self.assertEqual(artifact.project_name, "arac_kiralama")
        self.assertIn("public/index.php", artifact.files)
        self.assertIn("schema.sql", artifact.files)
        self.assertIn("PDO", artifact.files["config.php"])
        self.assertIn("reservations", artifact.files["schema.sql"])

    def test_followup_delivery_uses_recent_user_context(self):
        history = [
            {
                "role": "user",
                "content": (
                    "PHP 8.3 veritabanli arac kiralama web sitesi istiyorum, "
                    "dosyalari zip olarak teslim et."
                ),
            }
        ]

        self.assertTrue(should_deliver_project("Simdi tasarlayabilir misin?", history))
        artifact = build_delivery_artifact("Simdi tasarlayabilir misin?", history)
        self.assertIsNotNone(artifact)
        assert artifact is not None
        self.assertEqual(artifact.project_name, "arac_kiralama")

    def test_chat_job_has_action_first_delivery_gate(self):
        jobs = read("codegaai/api/routes/jobs.py")

        self.assertIn("def _maybe_deliver_artifact", jobs)
        self.assertIn("_maybe_deliver_artifact(job.message, history)", jobs)
        self.assertIn("engine.generate_agentic(messages, cfg=cfg, max_iters=3)", jobs)


if __name__ == "__main__":
    unittest.main()
