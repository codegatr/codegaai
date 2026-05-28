const { autoUpdater } = require("electron-updater");
const { app } = require("electron");
const { UPDATE_INTERVAL_MS } = require("../shared/constants");

class UpdateService {
  constructor() {
    this.mainWindow = null;
    this.readyToInstall = false;
  }

  attach(mainWindow) {
    this.mainWindow = mainWindow;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.verifyUpdateCodeSignature = false;

    autoUpdater.on("checking-for-update", () => this.emit("checking"));
    autoUpdater.on("update-available", (info) => this.emit("available", info));
    autoUpdater.on("update-not-available", () => this.emit("not-available"));
    autoUpdater.on("download-progress", (progress) => this.emit("downloading", progress));
    autoUpdater.on("update-downloaded", (info) => {
      this.readyToInstall = true;
      this.emit("ready", info);
    });
    autoUpdater.on("error", (error) => {
      const message = error.message || String(error);
      const unsignedInstaller = /not digitally signed|not signed by the application owner/i.test(message);
      this.emit("error", {
        message: unsignedInstaller
          ? "Bu kurulu sürüm imzasız installer doğrulamasına takıldı. Yeni updater düzeltmesi için bu sürümü bir kez installer ile manuel kurman gerekiyor."
          : message,
      });
    });
  }

  emit(state, detail = {}) {
    this.mainWindow?.webContents.send("updates:status", { state, detail });
  }

  start() {
    setInterval(() => this.check(), UPDATE_INTERVAL_MS);
  }

  async check() {
    if (process.env.NODE_ENV === "development" || !app.isPackaged) {
      this.emit("not-available", { reason: "development" });
      return { skipped: true };
    }
    return autoUpdater.checkForUpdates();
  }

  async download() {
    return autoUpdater.downloadUpdate();
  }

  installNow() {
    if (!this.readyToInstall) {
      this.emit("error", { message: "Güncelleme henüz kuruluma hazır değil." });
      return;
    }
    autoUpdater.quitAndInstall(false, true);
  }
}

module.exports = {
  UpdateService,
};
