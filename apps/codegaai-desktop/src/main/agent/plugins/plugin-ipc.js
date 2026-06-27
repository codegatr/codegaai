"use strict";

/**
 * plugin-ipc.js — CODEGA AI Plugin System IPC Channels
 *
 * Kanallar:
 *   plugin:list              — yüklü tüm plugin'leri listele
 *   plugin:info              — tek plugin detayı
 *   plugin:enable            — plugin'i etkinleştir
 *   plugin:disable           — plugin'i devre dışı bırak
 *   plugin:install-zip       — ZIP dosyasından kur
 *   plugin:uninstall         — kaldır
 *   plugin:reload            — plugin'i sıfırdan yükle (hot-reload)
 *   plugin:intent-handlers   — kayıtlı intent listesi
 */

const { ipcMain, app } = require("electron");
const path = require("node:path");
const { PluginEngine } = require("./plugin-engine");

let _engine = null;

async function getEngine() {
  if (!_engine) {
    const pluginsDir = path.join(app.getPath("userData"), "plugins");
    _engine = new PluginEngine(pluginsDir);
    await _engine.init();
  }
  return _engine;
}

function registerPluginIpc() {

  // ── plugin:list ─────────────────────────────────────────────
  ipcMain.handle("plugin:list", async () => {
    const engine = await getEngine();
    return engine.list();
  });

  // ── plugin:info ─────────────────────────────────────────────
  ipcMain.handle("plugin:info", async (_event, id) => {
    if (!id || typeof id !== "string") throw new Error("Geçersiz plugin id");
    const engine = await getEngine();
    return engine.info(id);
  });

  // ── plugin:enable ────────────────────────────────────────────
  ipcMain.handle("plugin:enable", async (_event, id) => {
    if (!id || typeof id !== "string") throw new Error("Geçersiz plugin id");
    const engine = await getEngine();
    return await engine.enable(id);
  });

  // ── plugin:disable ───────────────────────────────────────────
  ipcMain.handle("plugin:disable", async (_event, id) => {
    if (!id || typeof id !== "string") throw new Error("Geçersiz plugin id");
    const engine = await getEngine();
    return await engine.disable(id);
  });

  // ── plugin:install-zip ───────────────────────────────────────
  ipcMain.handle("plugin:install-zip", async (_event, zipPath) => {
    if (!zipPath || typeof zipPath !== "string") throw new Error("Geçersiz ZIP yolu");
    const engine = await getEngine();
    return await engine.installFromZip(zipPath);
  });

  // ── plugin:uninstall ─────────────────────────────────────────
  ipcMain.handle("plugin:uninstall", async (_event, id) => {
    if (!id || typeof id !== "string") throw new Error("Geçersiz plugin id");
    const engine = await getEngine();
    return await engine.uninstall(id);
  });

  // ── plugin:reload ────────────────────────────────────────────
  ipcMain.handle("plugin:reload", async (_event, id) => {
    if (!id || typeof id !== "string") throw new Error("Geçersiz plugin id");
    const engine = await getEngine();
    await engine.disable(id);
    return await engine.enable(id);
  });

  // ── plugin:intent-handlers ───────────────────────────────────
  ipcMain.handle("plugin:intent-handlers", async () => {
    const engine = await getEngine();
    const handlers = engine.getIntentHandlers();
    return Object.entries(handlers).map(([intent, entry]) => ({
      intent,
      pluginId: entry.pluginId,
    }));
  });
}

/** main.js'in diğer yerleri engine'e erişebilsin diye */
async function getPluginEngine() {
  return getEngine();
}

module.exports = { registerPluginIpc, getPluginEngine };
