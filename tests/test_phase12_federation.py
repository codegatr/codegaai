"""Faz 12 tests - federated learning network."""

from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path


class TestFederationCoordinator(unittest.TestCase):

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

    def test_coordinator_accepts_stats_and_distributes_topic_signal(self) -> None:
        from codegaai.core.federation import FederationCoordinator

        coordinator = FederationCoordinator()
        result = coordinator.submit_stats({
            "type": "node_stats",
            "data": {
                "version": "test",
                "conversation_count": 3,
                "topic_hashes": ["abc123"],
                "topic_summaries": ["FastAPI RAG"],
            },
        }, "node-a")

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["peer_count"], 1)

        own = coordinator.knowledge("node-a", since=0)
        self.assertEqual(own["items"], [])

        other = coordinator.knowledge("node-b", since=0)
        self.assertEqual(other["peer_count"], 1)
        self.assertEqual(len(other["items"]), 1)
        self.assertIn("FastAPI RAG", other["items"][0]["text"])

    def test_admin_snapshot_reports_status_page_metrics(self) -> None:
        from codegaai.core.federation import FederationCoordinator

        coordinator = FederationCoordinator()
        coordinator.submit_stats({
            "type": "node_stats",
            "data": {
                "version": "3.7.0",
                "conversation_count": 5,
                "feedbacks": {"positive": 2, "negative": 1},
                "adapter_count": 1,
                "topic_hashes": ["abc", "def"],
                "topic_summaries": ["Federation status page"],
            },
        }, "node-admin")

        snapshot = coordinator.admin_snapshot()

        self.assertEqual(snapshot["overall_status"], "operational")
        self.assertEqual(snapshot["summary"]["active_peers"], 1)
        self.assertEqual(snapshot["summary"]["total_nodes"], 1)
        self.assertEqual(snapshot["summary"]["knowledge_signals"], 1)
        self.assertEqual(snapshot["nodes"][0]["feedback_total"], 3)
        self.assertEqual(snapshot["nodes"][0]["adapter_count"], 1)
        self.assertIn("components", snapshot)
        self.assertEqual(snapshot["recent_knowledge"][0]["topic"], "Federation status page")

    def test_manager_persists_opt_in_state(self) -> None:
        from codegaai.core.federation import FederationManager

        manager = FederationManager.get()
        manager._enabled = True
        manager._status.enabled = True
        manager._status.coordinator = "https://example.test/api/federation"
        manager._status.state = "connected"
        manager._status.peers_count = 2
        manager._save_config()
        manager._save_state()

        FederationManager._instance = None
        restored = FederationManager.get()

        self.assertTrue(restored.is_enabled)
        self.assertEqual(restored.status["coordinator"], "https://example.test/api/federation")
        self.assertEqual(restored.status["peers_count"], 2)
        self.assertEqual(restored.status["state"], "connected")


if __name__ == "__main__":
    unittest.main()
