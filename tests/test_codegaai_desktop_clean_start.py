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
        self.assertIn('"version": "6.0.0-alpha.113"', package)
        self.assertNotIn('"publisherName": "CODEGA"', package)
        self.assertIn("workflow_dispatch:", workflow)
        self.assertIn("npm version $version --no-git-tag-version --allow-same-version", workflow)
        self.assertIn("release/latest.yml", workflow)
        self.assertIn("tag=desktop-v$version", workflow)
        self.assertIn("startsWith(github.ref, 'refs/tags/desktop-v')", workflow)
        self.assertIn("inputs.publish_release == 'true'", workflow)

    def test_update_flow_can_close_and_install_running_app(self):
        updater = read("apps/codegaai-desktop/src/main/update-service.js")
        renderer = read("apps/codegaai-desktop/src/renderer/renderer.js")

        self.assertIn("autoUpdater.autoDownload = false", updater)
        self.assertIn("CODEGA_ALLOW_UNSIGNED_UPDATES", updater)
        self.assertIn("autoUpdater.verifyUpdateCodeSignature", updater)
        self.assertNotIn("autoUpdater.verifyUpdateCodeSignature = false", updater)
        self.assertIn("autoUpdater.quitAndInstall(false, true)", updater)
        self.assertIn("!app.isPackaged", updater)
        self.assertIn("updates:status", updater)
        self.assertNotIn("setTimeout(() => this.check(), 3500)", updater)
        self.assertIn("imzasiz", updater)
        self.assertIn("Güncelleme kontrol edilemedi", renderer)
        self.assertIn("Güncelleme hatası", renderer)
        self.assertIn("Güncelleme indirildi", renderer)
        self.assertIn("checkUpdatesAfterFirstQuery", renderer)
        self.assertIn("showUpdatePrompt(\"available\"", renderer)
        self.assertIn("showUpdatePrompt(\"ready\"", renderer)

    def test_desktop_release_hardening_for_av_reputation(self):
        package = read("apps/codegaai-desktop/package.json")
        workflow = read(".github/workflows/build-codegaai-desktop-windows.yml")
        security = read("SECURITY.md")
        readme = read("apps/codegaai-desktop/README.md")

        self.assertIn('"asar": true', package)
        self.assertIn('"!**/__pycache__/**"', package)
        self.assertIn('"!**/*.pyc"', package)
        self.assertIn('"requestedExecutionLevel": "asInvoker"', package)
        self.assertIn('"signAndEditExecutable": true', package)
        self.assertIn('"dist:mac": "electron-builder --mac dmg zip --universal --publish never"', package)
        self.assertIn('"release:prepare": "npm run test:ci"', package)
        self.assertIn('"mac": {', package)
        self.assertIn('"category": "public.app-category.productivity"', package)
        self.assertIn("WINDOWS_CSC_LINK", workflow)
        self.assertIn("WINDOWS_CSC_KEY_PASSWORD", workflow)
        self.assertIn("SHA256SUMS.txt", workflow)
        self.assertIn("Get-AuthenticodeSignature", workflow)
        self.assertIn("UNSIGNED-BUILD-NOTICE.txt", workflow)
        self.assertIn("Malwarebytes", security)
        self.assertIn("SHA-256", security)
        self.assertIn("Updater signature verification is enabled by default", readme)

    def test_update_prompt_asks_now_or_later(self):
        html = read("apps/codegaai-desktop/src/renderer/index.html")
        css = read("apps/codegaai-desktop/src/renderer/styles.css")

        self.assertIn('id="update-prompt"', html)
        self.assertIn("Şimdi Güncelle", html)
        self.assertIn("Daha Sonra", html)
        self.assertIn(".update-prompt", css)

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
        self.assertIn("OLLAMA_COMMAND_TIMEOUT_MS", constants)
        self.assertIn("const OLLAMA_CHAT_TIMEOUT_MS = 180 * 1000", constants)
        self.assertIn("MODEL_OPTIONS", constants)
        self.assertIn("qwen3:8b", constants)
        self.assertIn("LOCALAPPDATA", model_manager)
        self.assertIn("ollamaCandidates", model_manager)
        self.assertIn("modelCandidates", model_manager)
        self.assertIn("detectTask", model_manager)
        self.assertIn("TASK_MODELS", model_manager)
        self.assertIn("candidateModelsForTask", model_manager)
        self.assertIn("attemptModels.slice(0, 4)", model_manager)
        self.assertIn('"qwen2.5-coder:3b-instruct"', model_manager)
        self.assertIn('"qwen2.5-coder:7b-instruct"', model_manager)
        self.assertIn("runOllama", model_manager)
        self.assertIn("child.kill()", model_manager)
        self.assertIn("timedOut", model_manager)
        self.assertIn("codega-timeout", model_manager)
        self.assertIn('action: "install_ollama"', model_manager)
        self.assertIn("shell.openExternal(status.actionUrl)", main)
        self.assertIn('ipcMain.handle("models:list"', main)
        self.assertIn("prepareModel(modelId", main)
        self.assertIn("prepareDefaultModel", model_manager)
        self.assertIn("els.prepareModel.disabled = true", renderer)
        self.assertIn("window.codega.getModels", renderer)
        self.assertIn("data-model", renderer)
        self.assertIn("Düşünüyorum...", renderer)
        self.assertNotIn("Uygun model seçiliyor", renderer)
        self.assertNotIn("Kullanılan model:", model_manager)
        self.assertNotIn("Ayarlar'dan daha küçük/hızlı zeka paketini indirirsen", model_manager)
        self.assertIn("scrollConversationToBottom", renderer)
        self.assertIn("scrollIntoView", renderer)
        self.assertIn("window.codega.sendMessage", renderer)
        self.assertIn('event.key === "Enter"', renderer)
        self.assertIn("els.form.requestSubmit()", renderer)

    def test_minimal_ui_keeps_history_settings_and_prompt(self):
        html = read("apps/codegaai-desktop/src/renderer/index.html")
        css = read("apps/codegaai-desktop/src/renderer/styles.css")

        self.assertIn("Sohbet Geçmişi", html)
        self.assertIn("settings-button", html)
        self.assertIn("Ne yapmak istiyorsun?", html)
        self.assertIn("grid-template-columns: 286px 1fr", css)
        self.assertIn("border-radius: 999px", css)

    def test_desktop_history_can_share_delete_persist_and_export_zip(self):
        renderer = read("apps/codegaai-desktop/src/renderer/renderer.js")
        css = read("apps/codegaai-desktop/src/renderer/styles.css")

        self.assertIn("STORAGE_KEY", renderer)
        self.assertIn("localStorage.setItem", renderer)
        self.assertIn("loadChats", renderer)
        self.assertIn("shareChat", renderer)
        self.assertIn("buildShareLink", renderer)
        self.assertIn("#share=", renderer)
        self.assertIn("navigator.clipboard.writeText", renderer)
        self.assertIn("window.codega.shareChat", renderer)
        self.assertIn("deleteChat", renderer)
        self.assertIn("window.confirm", renderer)
        self.assertIn("downloadChatZip", renderer)
        self.assertIn("buildZip", renderer)
        self.assertIn("chat.json", renderer)
        self.assertIn("chat.md", renderer)
        self.assertIn(".history-entry", css)
        self.assertIn(".history-actions", css)

    def test_desktop_share_uses_codega_federation_service(self):
        constants = read("apps/codegaai-desktop/src/shared/constants.js")
        main = read("apps/codegaai-desktop/src/main/main.js")
        preload = read("apps/codegaai-desktop/src/main/preload.js")

        self.assertIn("FEDERATION_BASE_URL", constants)
        self.assertIn("https://ai.codega.com.tr/api/federation", constants)
        self.assertIn('ipcMain.handle("chat:share"', main)
        self.assertIn('`${FEDERATION_BASE_URL}/share/`', main)
        self.assertIn("shareChat", preload)


if __name__ == "__main__":
    unittest.main()
