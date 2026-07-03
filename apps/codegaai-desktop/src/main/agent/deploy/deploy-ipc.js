"use strict";

/**
 * deploy-ipc.js — DeploymentManager IPC köprüsü (V7).
 *
 * Kanallar:
 *   deploy:test    ()                              → DirectAdmin bağlantı testi
 *   deploy:start   ({localZipPath, remoteDir})     → ZIP yükle + sunucuda aç
 *   deploy:status  ()                              → iş listesi (gözlemlenebilirlik)
 * Push:
 *   deploy:progress {jobId, phase, progress, detail} → renderer progress bar
 *
 * Güvenlik: deploy YALNIZ renderer'daki açık kullanıcı eylemiyle tetiklenir;
 * toolPermissions.deployment === "deny" ise preflight reddeder. Login key
 * hiçbir event/status yanıtında yer almaz.
 */

const { ipcMain, BrowserWindow } = require("electron");
const { DeploymentManager } = require("./deployment-manager");

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send(channel, payload); } catch (_e) {}
  }
}

function registerDeployIpc({ getSettings }) {
  const manager = new DeploymentManager({
    getSettings,
    onEvent: (job) => broadcast("deploy:progress", {
      jobId: job.jobId, zip: job.zip, phase: job.phase,
      progress: job.progress, detail: job.detail, remoteDir: job.remoteDir,
    }),
  });

  ipcMain.handle("deploy:test", async () => {
    try { return await manager.testConnection(); }
    catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  });

  ipcMain.handle("deploy:start", async (_e, args = {}) => {
    try { return await manager.deployZip({ localZipPath: args.localZipPath, remoteDir: args.remoteDir }); }
    catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  });

  ipcMain.handle("deploy:status", async () => [...manager.jobs.values()]);

  return manager;
}

module.exports = { registerDeployIpc };
