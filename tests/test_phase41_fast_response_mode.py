from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class FastResponseModeTests(unittest.TestCase):
    def test_fast_mode_api_contract_and_short_context(self):
        jobs = read("codegaai/api/routes/jobs.py")

        self.assertIn("speed_mode: bool = True", jobs)
        self.assertIn("self.speed_mode = speed_mode", jobs)
        self.assertIn("limit=8 if job.speed_mode else 30", jobs)
        self.assertIn("n_results=2 if job.speed_mode else 5", jobs)
        self.assertIn("not job.speed_mode", jobs)
        self.assertIn("_needs_retry(job.message, job.content)", jobs)

    def test_fast_mode_prefers_downloaded_3b_model(self):
        jobs = read("codegaai/api/routes/jobs.py")

        self.assertIn("recommend_llm_model", jobs)
        self.assertIn("detect_device_profile", jobs)
        self.assertIn("downloaded_ids", jobs)

    def test_fast_mode_ui_toggle_and_payload(self):
        index = read("codegaai/ui/web/index.html")
        chat = read("codegaai/ui/web/js/chat.js")

        self.assertIn('id="speed-toggle"', index)
        self.assertIn("toggleSpeedMode()", index)
        self.assertIn("let _speedMode = true", chat)
        self.assertIn("speed_mode: !!_speedMode", chat)
        self.assertIn("(_thinkMode ? 1024 : (_speedMode ? 384 : 512))", chat)

    def test_engine_uses_explicit_cpu_threads_for_llama_cpp(self):
        engine = read("codegaai/core/engine.py")

        self.assertIn("cpu_count = os.cpu_count() or 4", engine)
        self.assertIn("n_threads = 2 if low_end else max(2, min(cpu_count - 1, 8))", engine)

    def test_version_bumped_to_454(self):
        init = read("codegaai/__init__.py")

        self.assertIn('__version__ = "4.5.13"', init)
        self.assertIn("Direct Command Fast Path", init)
