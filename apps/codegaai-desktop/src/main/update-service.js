const { autoUpdater } = require("electron-updater");
const { app } = require("electron");
const { UPDATE_INTERVAL_MS } = require("../shared/constants");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function updateErrorMessage(error) {
  const message = error && error.message ? error.message : String(error || "");
  if (/not digitally signed|not signed by the application owner/i.test(message)) {
    return "Bu kurulu sürüm imzasız installer doğrulamasına takıldı. Yeni updater düzeltmesi için bu sürümü bir kez installer ile manuel kurman gerekiyor.";
  }
  if (/status code 502|HttpError:\s*502|Unicorn|This page is taking too long to load|github\.com/i.test(message)) {
    return "GitHub güncelleme dosyasına şu an ulaşılamadı. Bağlantı veya GitHub geçici olarak yoğun olabilir; birazdan tekrar dene.";
  }
  if (/sha512 checksum mismatch|checksum mismatch/i.test(message)) {
    return "Güncelleme dosyası doğrulanamadı. İndirme bozulmuş veya GitHub release dosyası yeni güncellenmiş olabilir; birazdan tekrar kontrol edip yeniden indir.";
  }
  if (/latest\.ya?ml|release|download/i.test(message)) {
    return "Güncelleme bilgisi okunamadı. Release dosyası henüz hazır olmayabilir; birazdan tekrar dene.";
  }
  return message.replace(/\s*Data:\s*<!DOCTYPE html>[\s\S]*/i, "").slice(0, 240);
}

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
      this.emit("error", { message: updateErrorMessage(error) });
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

    try {
      return await autoUpdater.checkForUpdates();
    } catch (error) {
      const raw = error && error.message ? error.message : String(error);
      if (/status code 502|HttpError:\s*502|Unicorn|github\.com/i.test(raw)) {
        await sleep(1500);
        try {
          return await autoUpdater.checkForUpdates();
        } catch (retryError) {
          const message = updateErrorMessage(retryError);
          this.emit("error", { message });
          return { ok: false, message };
        }
      }
      const message = updateErrorMessage(error);
      this.emit("error", { message });
      return { ok: false, message };
    }
  }

  async download() {
    try {
      return await autoUpdater.downloadUpdate();
    } catch (error) {
      const message = updateErrorMessage(error);
      this.emit("error", { message });
      return { ok: false, message };
    }
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
