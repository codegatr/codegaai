from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class Qwen3ModelUpgradeTests(unittest.TestCase):
    def test_qwen3_models_are_primary_catalog_entries(self):
        registry = read("codegaai/core/models_registry.py")

        self.assertIn('id="qwen3-4b-q4_k_m"', registry)
        self.assertIn('hf_repo="Qwen/Qwen3-4B-GGUF"', registry)
        self.assertIn('hf_file="Qwen3-4B-Q4_K_M.gguf"', registry)
        self.assertIn('id="qwen3-8b-q4_k_m"', registry)
        self.assertIn('hf_repo="Qwen/Qwen3-8B-GGUF"', registry)
        self.assertIn('hf_file="Qwen3-8B-Q4_K_M.gguf"', registry)
        self.assertIn('id="qwen3-next-80b-a3b-instruct-q4_k_m"', registry)
        self.assertIn('hf_repo="Qwen/Qwen3-Next-80B-A3B-Instruct-GGUF"', registry)
        self.assertIn('hf_file="Qwen3-Next-80B-A3B-Instruct-Q4_K_M.gguf"', registry)

    def test_qwen3_4b_is_default_and_config_default(self):
        registry = read("codegaai/core/models_registry.py")
        config = read("codegaai/config.py")

        qwen3_default_block = registry[
            registry.index('id="qwen3-4b-q4_k_m"'):
            registry.index('id="qwen3-8b-q4_k_m"')
        ]
        qwen25_block = registry[
            registry.index('id="qwen2.5-7b-instruct-q4_k_m"'):
            registry.index('id="qwen2.5-coder-7b-instruct-q4_k_m"')
        ]

        self.assertIn("default=True", qwen3_default_block)
        self.assertNotIn("default=True", qwen25_block)
        self.assertIn('"llm": "qwen3-4b-q4_k_m"', config)

    def test_model_load_errors_are_visible_to_api_and_ui(self):
        api = read("codegaai/api/routes/models.py")
        system_js = read("codegaai/ui/web/js/system.js")

        self.assertIn('"load_error": load_error', api)
        self.assertIn("if not engine.is_ready", api)
        self.assertIn("Yükleme hatası:", system_js)
        self.assertIn("Son yükleme hatası:", system_js)

    def test_auto_loader_prefers_qwen3(self):
        chat = read("codegaai/ui/web/js/chat.js")
        router = read("codegaai/core/model_router.py")

        self.assertIn('m.id === "qwen3-4b-q4_k_m"', chat)
        self.assertIn('m.id === "qwen3-8b-q4_k_m"', chat)
        self.assertIn('model_id="qwen3-4b-q4_k_m"', router)
        self.assertIn('model_id="qwen3-8b-q4_k_m"', router)


if __name__ == "__main__":
    unittest.main()
