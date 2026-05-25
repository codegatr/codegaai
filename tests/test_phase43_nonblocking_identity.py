from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class NonBlockingIdentityTests(unittest.TestCase):
    def test_chat_jobs_warm_models_without_blocking_response(self):
        jobs = read("codegaai/api/routes/jobs.py")

        self.assertIn("warm_model_async(target_model)", jobs)
        self.assertIn("warm_model_async(rec.model_id)", jobs)
        self.assertIn("Model geçişi arka plana bırakıldı", jobs)
        self.assertNotIn("router.switch_model_if_needed(target_model)", jobs)
        self.assertNotIn("engine.load(rec.model_id)", jobs)

    def test_recommended_warmup_endpoint_is_non_blocking(self):
        models = read("codegaai/api/routes/models.py")
        helper = read("codegaai/core/model_warmup.py")
        chat = read("codegaai/ui/web/js/chat.js")

        self.assertIn('@router.post("/recommended/warmup")', models)
        self.assertIn("warm_model_async(rec.model_id)", models)
        self.assertIn("threading.Thread", helper)
        self.assertIn("daemon=True", helper)
        self.assertIn('/api/models/recommended/warmup', chat)
        self.assertNotIn('/api/models/${target.id}/load', chat)

    def test_codega_identity_aliases_cover_codex_claude_and_gemini(self):
        prompt = read("codegaai/core/system_prompt.py")
        jobs = read("codegaai/api/routes/jobs.py")

        self.assertIn("CODEX", prompt)
        self.assertIn("Claude", prompt)
        self.assertIn("Gemini", prompt)
        self.assertIn("CODEGA AI'ye yöneltilmiş takma ad", prompt)
        self.assertIn("ben Claude değilim", prompt)
        self.assertIn("codex|code\\s*x|claude|gemini|chatgpt|gpt", jobs)
        self.assertIn("CODEGA AI gibi cevapla", jobs)
        self.assertNotIn("Claude gibi cevapla", jobs)
