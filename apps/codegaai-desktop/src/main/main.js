const path = require("node:path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { APP_NAME, FEDERATION_BASE_URL } = require("../shared/constants");
const { ModelManager } = require("./model-manager");
const { UpdateService } = require("./update-service");
const settingsStore = require("./agent/settings-store");
const memory = require("./agent/memory");

const modelManager = new ModelManager();
const updateService = new UpdateService();

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    title: APP_NAME,
    backgroundColor: "#050505",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, "../renderer/index.html"));
  updateService.attach(win);
  return win;
}

function registerIpc() {
  ipcMain.handle("app:status", async () => {
    const model = await modelManager.detect();
    return {
      appName: APP_NAME,
      version: app.getVersion(),
      model,
    };
  });

  ipcMain.handle("chat:send", async (_event, message) => {
    return modelManager.ask(message);
  });

  ipcMain.handle("chat:share", async (_event, chat) => {
    const response = await fetch(`${FEDERATION_BASE_URL}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: chat?.title || "CODEGA AI Sohbeti",
        messages: Array.isArray(chat?.messages) ? chat.messages : [],
        app_version: app.getVersion(),
      }),
    });
    if (!response.ok) {
      throw new Error(`Paylaşım servisi cevap vermedi: ${response.status}`);
    }
    return response.json();
  });

  ipcMain.handle("models:list", async () => modelManager.getModels());

  ipcMain.handle("model:prepare", async (event, modelId) => {
    const status = await modelManager.prepareModel(modelId, (progress) => {
      event.sender.send("model:status", progress);
    });
    if (status.action === "install_ollama" && status.actionUrl) {
      await shell.openExternal(status.actionUrl);
      return {
        ...status,
        message: "Ollama indirme sayfası açıldı. Kurulumdan sonra CODEGA AI'yi yeniden aç veya Modeli Hazırla'ya tekrar bas.",
      };
    }
    return status;
  });

  ipcMain.handle("updates:check", async () => updateService.check());
  ipcMain.handle("updates:download", async () => updateService.download());
  ipcMain.handle("updates:install", async () => updateService.installNow());

  ipcMain.handle("settings:get", async () => settingsStore.getSettings());
  ipcMain.handle("settings:set", async (_event, patch) => settingsStore.setSettings(patch));
  ipcMain.handle("memory:list", async () => memory.listFacts());
  ipcMain.handle("memory:clear", async () => memory.clearAll());
}

app.whenReady().then(async () => {
  // Hafıza ve ayarlar kullanıcının userData dizininde kalıcı olsun
  process.env.CODEGA_MEMORY_PATH =
    process.env.CODEGA_MEMORY_PATH || path.join(app.getPath("userData"), "memory.json");
  process.env.CODEGA_SETTINGS_PATH =
    process.env.CODEGA_SETTINGS_PATH || path.join(app.getPath("userData"), "agent-settings.json");

  registerIpc();
  createWindow();
  updateService.start();
  await modelManager.detect();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
