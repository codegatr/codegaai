from __future__ import annotations

import queue
import unittest
from unittest.mock import MagicMock


class TestAutonomousLearnerTopicGuards(unittest.TestCase):
    def _learner(self):
        from codegaai.core.autonomous_learner import (
            AutonomousLearner,
            LearnerStats,
        )

        lrn = AutonomousLearner.__new__(AutonomousLearner)
        lrn._stats = LearnerStats(cycles_completed=1)
        lrn._topic_queue = queue.Queue(maxsize=20)
        lrn._queued_topics = set()
        lrn._seen_hashes = set()
        lrn._knowledge_map = {}
        lrn._wiki = MagicMock()
        lrn._arxiv = MagicMock()
        lrn._hn = MagicMock()
        lrn._so = MagicMock()
        lrn._gh = MagicMock()
        lrn._wiki.fetch.return_value = None
        lrn._arxiv.fetch.return_value = None
        lrn._hn.fetch_top.return_value = []
        lrn._so.fetch.return_value = []
        lrn._gh.fetch_trending.return_value = []
        return lrn

    def test_generic_single_word_topic_is_not_enqueued(self) -> None:
        lrn = self._learner()

        self.assertTrue(lrn._enqueue_topic("change"))
        self.assertEqual(lrn._topic_queue.qsize(), 0)

        self.assertTrue(lrn._enqueue_topic("PHP FPM"))
        self.assertTrue(lrn._enqueue_topic("php fpm"))
        self.assertEqual(lrn._topic_queue.qsize(), 1)

    def test_next_topic_skips_persisted_generic_items(self) -> None:
        lrn = self._learner()
        lrn._topic_queue.put_nowait("change")
        lrn._topic_queue.put_nowait("PHP FPM")

        self.assertEqual(lrn._next_topic(), "PHP FPM")

    def test_failed_topic_is_marked_attempted(self) -> None:
        lrn = self._learner()
        lrn._enqueue_topic("PHP FPM")

        self.assertEqual(lrn._learn_cycle(), 0)
        self.assertIn("PHP FPM", lrn._knowledge_map)


if __name__ == "__main__":
    unittest.main()
