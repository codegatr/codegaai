from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


class Phase20AutoEmbeddingAndLogsTests(unittest.TestCase):
    def test_embedding_auto_download_is_enabled(self) -> None:
        self.assertIn('"auto_download_embedding": True', read("codegaai/config.py"))
        server = read("codegaai/api/server.py")
        self.assertIn("auto_download_embedding", server)
        self.assertIn('download_snapshot_async(\n                                        "bge-m3"', server)
        self.assertIn("thread.join()", server)
        self.assertIn('emb.load("bge-m3")', server)

    def test_memory_endpoint_can_prepare_embedding(self) -> None:
        memory = read("codegaai/api/routes/memory.py")
        self.assertIn('/ensure-embedding', memory)
        self.assertIn("embedding_downloaded", memory)
        self.assertIn('download_snapshot_async("bge-m3"', memory)

    def test_chat_status_triggers_embedding_prepare(self) -> None:
        chat = read("codegaai/ui/web/js/chat.js")
        self.assertIn("/api/memory/ensure-embedding", chat)
        self.assertIn("BGE-M3 indiriliyor", chat)
        self.assertIn("BGE-M3 otomatik", chat)

    def test_system_logs_are_visible_without_console(self) -> None:
        self.assertIn('@router.get("/logs")', read("codegaai/api/routes/system.py"))
        self.assertIn("system-log-lines", read("codegaai/ui/web/index.html"))
        self.assertIn("loadLogs", read("codegaai/ui/web/js/system.js"))
        self.assertIn(".system-log-lines", read("codegaai/ui/web/css/views.css"))

    def test_huggingface_token_is_used_for_snapshot_download(self) -> None:
        registry = read("codegaai/core/models_registry.py")
        self.assertIn("token=_hf_tok or None", registry)


if __name__ == "__main__":
    unittest.main()
