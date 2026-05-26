const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { APP_NAME } = require("../shared/constants");
const { ModelManager } = require("./model-manager");
const { UpdateService } = require("./update-service");

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

  ipcMain.handle("model:prepare", async (event) => {
    return modelManager.prepareDefaultModel((status) => {
      event.sender.send("model:status", status);
    });
  });

  ipcMain.handle("updates:check", async () => updateService.check());
  ipcMain.handle("updates:download", async () => updateService.download());
  ipcMain.handle("updates:install", async () => updateService.installNow());
}

app.whenReady().then(async () => {
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
