const { autoUpdater } = require("electron-updater");
const { app } = require("electron");
const https = require("https");
const { UPDATE_INTERVAL_MS } = require("../shared/constants");

const UPDATE_OWNER = "codegatr";
const UPDATE_REPO = "codegaai";
const RELEASES_API = `https://api.github.com/repos/${UPDATE_OWNER}/${UPDATE_REPO}/releases?per_page=20`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "CODEGA-AI-Updater",
      },
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`GitHub releases API ${response.statusCode}: ${body.slice(0, 160)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.setTimeout(10000, () => {
      request.destroy(new Error("GitHub releases API timeout"));
    });
  });
}

function versionFromDesktopTag(tagName) {
  const match = String(tagName || "").match(/^desktop-v(\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?)$/);
  return match ? match[1] : null;
}

function compareVersions(a, b) {
  const pa = String(a).split(/[.-]/);
  const pb = String(b).split(/[.-]/);
  const max = Math.max(pa.length, pb.length);
  for (let i = 0; i < max; i += 1) {
    const aa = pa[i] || "0";
    const bb = pb[i] || "0";
    const na = Number(aa);
    const nb = Number(bb);
    if (/^\d+$/.test(aa) && /^\d+$/.test(bb)) {
      if (na !== nb) return na > nb ? 1 : -1;
    } else if (aa !== bb) {
      return aa > bb ? 1 : -1;
    }
  }
  return 0;
}

function desktopReleaseHasMetadata(release) {
  const wanted = process.platform === "darwin" ? "latest-mac.yml" : "latest.yml";
  return Array.isArray(release?.assets) && release.assets.some((asset) => asset.name === wanted);
}

async function findDesktopUpdateRelease() {
  const releases = await fetchJson(RELEASES_API);
  return releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => ({ release, version: versionFromDesktopTag(release.tag_name) }))
    .filter((item) => item.version && desktopReleaseHasMetadata(item.release))
    .sort((a, b) => compareVersions(b.version, a.version))[0]?.release || null;
}

function updateErrorMessage(error) {
  const message = error && error.message ? error.message : String(error || "");
  if (/not digitally signed|not signed by the application owner/i.test(message)) {
    return "Bu kurulu surum imzasiz installer dogrulamasina takildi. Yeni updater duzeltmesi icin bu surumu bir kez installer ile manuel kurman gerekiyor.";
  }
  if (/status code 502|HttpError:\s*502|Unicorn|This page is taking too long to load|github\.com/i.test(message)) {
    return "GitHub guncelleme dosyasina su an ulasilamadi. Baglanti veya GitHub gecici olarak yogun olabilir; birazdan tekrar dene.";
  }
  if (/sha512 checksum mismatch|checksum mismatch/i.test(message)) {
    return "Guncelleme dosyasi dogrulanamadi. Indirme bozulmus veya GitHub release dosyasi yeni guncellenmis olabilir; birazdan tekrar kontrol edip yeniden indir.";
  }
  if (/latest\.ya?ml|release|download/i.test(message)) {
    return "Guncelleme bilgisi okunamadi. Desktop release metadata dosyasi bulunamadi; birazdan tekrar dene veya son installer'i manuel indir.";
  }
  return message.replace(/\s*Data:\s*<!DOCTYPE html>[\s\S]*/i, "").slice(0, 240);
}

class UpdateService {
  constructor() {
    this.mainWindow = null;
    this.readyToInstall = false;
    this.feedTag = null;
  }

  attach(mainWindow) {
    this.mainWindow = mainWindow;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.verifyUpdateCodeSignature = process.env.CODEGA_ALLOW_UNSIGNED_UPDATES === "1" ? false : true;

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

  async prepareFeed() {
    const desktopRelease = await findDesktopUpdateRelease();
    if (!desktopRelease) {
      throw new Error("Guncelleme kanalinda desktop metadata (latest.yml) bulunamadi.");
    }
    if (this.feedTag !== desktopRelease.tag_name) {
      autoUpdater.setFeedURL({
        provider: "generic",
        url: `https://github.com/${UPDATE_OWNER}/${UPDATE_REPO}/releases/download/${desktopRelease.tag_name}/`,
      });
      this.feedTag = desktopRelease.tag_name;
    }
  }

  async check() {
    if (process.env.NODE_ENV === "development" || !app.isPackaged) {
      this.emit("not-available", { reason: "development" });
      return { skipped: true };
    }

    try {
      await this.prepareFeed();
      return await autoUpdater.checkForUpdates();
    } catch (error) {
      const raw = error && error.message ? error.message : String(error);
      if (/status code 502|HttpError:\s*502|Unicorn|github\.com/i.test(raw)) {
        await sleep(1500);
        try {
          await this.prepareFeed();
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
      await this.prepareFeed();
      return await autoUpdater.downloadUpdate();
    } catch (error) {
      const message = updateErrorMessage(error);
      this.emit("error", { message });
      return { ok: false, message };
    }
  }

  installNow() {
    if (!this.readyToInstall) {
      this.emit("error", { message: "Guncelleme henuz kuruluma hazir degil." });
      return;
    }
    autoUpdater.quitAndInstall(false, true);
  }
}

module.exports = {
  UpdateService,
};
