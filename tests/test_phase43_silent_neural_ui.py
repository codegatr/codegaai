from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class SilentRuntimeAndNeuralUITests(unittest.TestCase):
    def test_system_checks_do_not_flash_windows_consoles(self):
        src = read("codegaai/utils/system_check.py")

        self.assertIn("CREATE_NO_WINDOW = 0x08000000", src)
        self.assertIn("def _check_output_hidden", src)
        self.assertEqual(src.count("subprocess.check_output("), 1)
        self.assertGreaterEqual(src.count("_check_output_hidden("), 4)

    def test_command_helpers_use_hidden_subprocesses_on_windows(self):
        codex_plus = read("codegaai/api/routes/codex_plus.py")
        updater = read("codegaai/core/updater.py")
        updater_api = read("codegaai/api/routes/updater.py")

        self.assertIn("CREATE_NO_WINDOW = 0x08000000", codex_plus)
        self.assertIn("creationflags=CREATE_NO_WINDOW", codex_plus)
        self.assertIn("DETACHED_PROCESS | CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP", updater)
        self.assertIn("0x00000008 | 0x08000000", updater_api)

    def test_neural_chat_theme_is_present(self):
        css = read("codegaai/ui/web/css/claude_theme.css")

        self.assertIn("CODEGA Neural Chat Shell (v4.4.4)", css)
        self.assertIn(".view[data-view=\"chat\"] .chat-container::before", css)
        self.assertIn("background-size: 56px 56px", css)
        self.assertIn(".view[data-view=\"chat\"] .message::before", css)
        self.assertIn(".view[data-view=\"chat\"] .chat-input-wrap:focus-within", css)

    def test_version_bumped_to_454(self):
        init = read("codegaai/__init__.py")

        self.assertIn('__version__ = "4.5.20"', init)
        self.assertIn("Fast Path Recovery", init)


if __name__ == "__main__":
    unittest.main()
