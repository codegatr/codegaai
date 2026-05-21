"""v4.3.6 federation intelligence and privacy tests."""

from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path


class TestFederatedIntelligence(unittest.TestCase):

    def setUp(self) -> None:
        import codegaai.core.federation as fed

        self.tmpdir = Path(tempfile.mkdtemp())
        fed.FEDERATION_DIR = self.tmpdir / "federation"
        fed.NODE_ID_FILE = fed.FEDERATION_DIR / "node_id"
        fed.CONFIG_FILE = fed.FEDERATION_DIR / "config.json"
        fed.STATE_FILE = fed.FEDERATION_DIR / "state.json"
        fed.RECEIVED_FILE = fed.FEDERATION_DIR / "received_knowledge.jsonl"
        fed.COORDINATOR_DIR = fed.FEDERATION_DIR / "coordinator"
        fed.COORDINATOR_NODES_FILE = fed.COORDINATOR_DIR / "nodes.json"
        fed.COORDINATOR_KNOWLEDGE_FILE = fed.COORDINATOR_DIR / "knowledge.jsonl"
        fed.FederationManager._instance = None

    def tearDown(self) -> None:
        import codegaai.core.federation as fed

        fed.FederationManager._instance = None
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_low_quality_or_secret_topics_are_not_distributed(self) -> None:
        from codegaai.core.federation import FederationCoordinator

        coordinator = FederationCoordinator()
        result = coordinator.submit_stats({
            "data": {
                "topic_summaries": [
                    "change",
                    "github token ghp_abcdefghijklmnopqrstuvwxyz123456",
                    "FastAPI dependency injection patterns",
                ],
            },
        }, "node-a")

        self.assertEqual(result["knowledge_created"], 1)
        other = coordinator.knowledge("node-b", since=0)
        self.assertEqual(len(other["items"]), 1)
        self.assertEqual(other["items"][0]["topic"], "FastAPI dependency injection patterns")
        self.assertIn("confidence", other["items"][0])
        self.assertGreaterEqual(other["items"][0]["quality"], 0.45)

    def test_topic_signals_are_aggregated_across_nodes(self) -> None:
        from codegaai.core.federation import FederationCoordinator

        coordinator = FederationCoordinator()
        for node in ("node-a", "node-b"):
            coordinator.submit_stats({
                "data": {
                    "version": "test",
                    "topic_summaries": ["PostgreSQL performance tuning"],
                },
            }, node)

        items = coordinator.knowledge("node-c", since=0)["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["source_count"], 2)
        self.assertGreater(items[0]["confidence"], 0.5)
        self.assertEqual(items[0]["protocol_version"], 2)

    def test_status_exposes_privacy_and_protocol_contract(self) -> None:
        from codegaai.core.federation import FederationManager, federation_capabilities

        status = FederationManager.get().status
        self.assertEqual(status["protocol_version"], 2)
        self.assertEqual(status["privacy_mode"], "anonymous_topic_signals_only")
        caps = federation_capabilities()
        self.assertIn("raw chat text", caps["never_shares"])
        self.assertIn("sanitized public topic signals", caps["shares"])


if __name__ == "__main__":
    unittest.main()
