from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "apps" / "codegaai-desktop"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class CodegaAiDesktopCleanStartTests(unittest.TestCase):
    def test_windows_desktop_app_is_isolated_from_legacy_python_stack(self):
        package = read("apps/codegaai-desktop/package.json")
        workflow = read(".github/workflows/build-codegaai-desktop-windows.yml")

        self.assertIn('"productName": "CODEGA AI"', package)
        self.assertIn('"electron-updater"', package)
        self.assertIn('"nsis"', package)
        self.assertIn("Build CODEGA AI Windows installer", workflow)
        self.assertIn("apps/codegaai-desktop", workflow)

    def test_update_flow_can_close_and_install_running_app(self):
        updater = read("apps/codegaai-desktop/src/main/update-service.js")

        self.assertIn("autoUpdater.autoDownload = false", updater)
        self.assertIn("autoUpdater.quitAndInstall(false, true)", updater)
        self.assertIn("updates:status", updater)

    def test_ai_layer_has_instant_and_ollama_providers(self):
        model_manager = read("apps/codegaai-desktop/src/main/model-manager.js")
        constants = read("apps/codegaai-desktop/src/shared/constants.js")
        main = read("apps/codegaai-desktop/src/main/main.js")
        renderer = read("apps/codegaai-desktop/src/renderer/renderer.js")

        self.assertIn("function instantAnswer", model_manager)
        self.assertIn("ollama", model_manager)
        self.assertIn("qwen2.5-coder:3b-instruct", constants)
        self.assertIn("qwen2.5:3b", constants)
        self.assertIn("https://ollama.com/download/windows", constants)
        self.assertIn("LOCALAPPDATA", model_manager)
        self.assertIn("ollamaCandidates", model_manager)
        self.assertIn("modelCandidates", model_manager)
        self.assertIn("runOllama", model_manager)
        self.assertIn('action: "install_ollama"', model_manager)
        self.assertIn("shell.openExternal(status.actionUrl)", main)
        self.assertIn("prepareDefaultModel", model_manager)
        self.assertIn("els.prepareModel.disabled = true", renderer)
        self.assertIn("window.codega.sendMessage", renderer)

    def test_minimal_ui_keeps_history_settings_and_prompt(self):
        html = read("apps/codegaai-desktop/src/renderer/index.html")
        css = read("apps/codegaai-desktop/src/renderer/styles.css")

        self.assertIn("Sohbet Geçmişi", html)
        self.assertIn("settings-button", html)
        self.assertIn("Ne yapmak istiyorsun?", html)
        self.assertIn("grid-template-columns: 286px 1fr", css)
        self.assertIn("border-radius: 999px", css)


if __name__ == "__main__":
    unittest.main()
