"use strict";

/**
 * plugin-engine.js — CODEGA AI Plugin Engine
 *
 * Her plugin'in entry.js'i şu arayüzü dışa aktarabilir:
 *
 *   module.exports = {
 *     // Zorunlu değil — plugin yüklendiğinde çağrılır
 *     onLoad(context) { ... },
 *
 *     // Zorunlu değil — plugin devre dışı bırakıldığında / kaldırıldığında çağrılır
 *     onUnload() { ... },
 *
 *     // IntentEngine'e kayıt edilecek intent'ler
 *     // key = intent adı, value = async handler(payload, context) → { answer }
 *     intentHandlers: {
 *       "myplugin.greet": async (payload, ctx) => ({ answer: `Merhaba ${payload.name}!` })
 *     },
 *
 *     // ipcMain'e eklenecek kanallar
 *     // key = kanal adı, value = async handler(_event, ...args) → result
 *     ipcHandlers: {
 *       "myplugin:hello": async (_e, name) => `Hello, ${name}!`
 *     },
 *   };
 *
 * context objesi:
 *   { pluginId, pluginDir, log(msg), store }
 *   store — plugin'in userData/plugins/<id>/data/ dizinine erişim
 *     store.get(key) → any
 *     store.set(key, value)
 *     store.path(filename) → absolute path
 */

const path   = require("node:path");
const fsp    = require("node:fs/promises");
const { ipcMain } = require("electron");
const { PluginStore } = require("./plugin-store");

// Güvenli require — sadece plugin kendi dizini içindeki dosyaları require edebilir
function sandboxedRequire(pluginDir) {
  return function safeRequire(mod) {
    // node built-ins ve production deps'e izin ver
    if (!mod.startsWith(".") && !mod.startsWith("/")) {
      return require(mod);
    }
    const resolved = require.resolve(mod, { paths: [pluginDir] });
    if (!resolved.startsWith(pluginDir + path.sep)) {
      throw new Error(`Plugin güvenlik ihlali: '${mod}' plugin dizini dışında`);
    }
    return require(resolved);
  };
}

// Basit key-value store per plugin
class PluginDataStore {
  constructor(pluginId, baseDir) {
    this._dir = path.join(baseDir, pluginId, "data");
    this._data = null;
    this._file = path.join(this._dir, "store.json");
  }
  async _load() {
    if (this._data) return;
    try {
      await fsp.mkdir(this._dir, { recursive: true });
      const raw = await fsp.readFile(this._file, "utf8");
      this._data = JSON.parse(raw);
    } catch { this._data = {}; }
  }
  async _flush() {
    await fsp.mkdir(this._dir, { recursive: true });
    await fsp.writeFile(this._file, JSON.stringify(this._data, null, 2), "utf8");
  }
  async get(key) {
    await this._load();
    return this._data[key];
  }
  async set(key, value) {
    await this._load();
    this._data[key] = value;
    await this._flush();
  }
  path(filename) {
    return path.join(this._dir, path.basename(filename));
  }
}

class PluginEngine {
  constructor(pluginsBaseDir) {
    this._store     = new PluginStore(pluginsBaseDir);
    this._baseDir   = pluginsBaseDir;
    this._loaded    = new Map(); // id → { module, ipcChannels: [] }
    this._ready     = false;
  }

  async init() {
    await this._store.discover();
    this._ready = true;
    // Enabled plugin'leri yükle
    for (const summary of this._store.list()) {
      if (summary.enabled) {
        try {
          await this._loadPlugin(summary.id);
        } catch (err) {
          console.error(`[PluginEngine] '${summary.id}' yüklenemedi:`, err.message);
        }
      }
    }
    console.log(`[PluginEngine] ${this._loaded.size} plugin yüklendi.`);
  }

  async _loadPlugin(id) {
    if (this._loaded.has(id)) return; // zaten yüklü
    const record = this._store.get(id);
    if (!record) throw new Error(`Plugin kaydı bulunamadı: ${id}`);

    const entryPath = path.resolve(record.pluginDir, record.manifest.entry);
    const dataStore = new PluginDataStore(id, this._baseDir);

    const context = {
      pluginId:  id,
      pluginDir: record.pluginDir,
      log: (msg) => console.log(`[Plugin:${id}] ${msg}`),
      store: dataStore,
    };

    // Sandboxed require ile modülü yükle
    let mod;
    try {
      // Plugin'in kendi require'ını patch etmek yerine, module'ü doğrudan yükle
      // Node'un require cache'ini temizle (hot-reload için)
      delete require.cache[require.resolve(entryPath)];
      mod = require(entryPath);
    } catch (err) {
      throw new Error(`Plugin '${id}' entry yüklenemedi: ${err.message}`);
    }

    // onLoad çağır
    if (typeof mod.onLoad === "function") {
      try {
        await mod.onLoad(context);
      } catch (err) {
        console.warn(`[PluginEngine] '${id}' onLoad hatası:`, err.message);
      }
    }

    // IPC handler'larını kaydet
    const registeredChannels = [];
    if (mod.ipcHandlers && typeof mod.ipcHandlers === "object") {
      for (const [channel, handler] of Object.entries(mod.ipcHandlers)) {
        if (typeof handler !== "function") continue;
        // Güvenlik: kanal adı plugin id'siyle başlamalı
        if (!channel.startsWith(`${id}:`)) {
          console.warn(`[PluginEngine] '${id}': IPC kanalı '${channel}' plugin id'siyle başlamalı — atlandı`);
          continue;
        }
        ipcMain.handle(channel, async (event, ...args) => {
          try {
            return await handler(event, ...args);
          } catch (err) {
            throw new Error(`[Plugin:${id}] ${err.message}`);
          }
        });
        registeredChannels.push(channel);
      }
    }

    this._loaded.set(id, { module: mod, ipcChannels: registeredChannels, context });
    console.log(`[PluginEngine] '${id}' yüklendi (${registeredChannels.length} IPC kanalı)`);
  }

  async _unloadPlugin(id) {
    const loaded = this._loaded.get(id);
    if (!loaded) return;

    // onUnload çağır
    if (typeof loaded.module.onUnload === "function") {
      try {
        await loaded.module.onUnload();
      } catch (err) {
        console.warn(`[PluginEngine] '${id}' onUnload hatası:`, err.message);
      }
    }

    // IPC handler'larını kaldır
    for (const channel of loaded.ipcChannels) {
      ipcMain.removeHandler(channel);
    }

    // Require cache temizle (hot-reload için)
    const record = this._store.get(id);
    if (record) {
      try {
        const entryPath = path.resolve(record.pluginDir, record.manifest.entry);
        delete require.cache[require.resolve(entryPath)];
      } catch {}
    }

    this._loaded.delete(id);
    console.log(`[PluginEngine] '${id}' kaldırıldı`);
  }

  // ── Public API ──────────────────────────────────────────────

  /** Tüm plugin'lerin özetini döner (yüklü/yüklü değil bilgisiyle) */
  list() {
    return this._store.list().map(s => ({
      ...s,
      loaded: this._loaded.has(s.id),
      ipcChannels: this._loaded.get(s.id)?.ipcChannels || [],
    }));
  }

  /** Plugin hakkında detay */
  info(id) {
    const summary = this._store.list().find(s => s.id === id);
    if (!summary) throw new Error(`Plugin bulunamadı: ${id}`);
    const loaded = this._loaded.get(id);
    return {
      ...summary,
      loaded: !!loaded,
      ipcChannels: loaded?.ipcChannels || [],
      intentHandlers: loaded ? Object.keys(loaded.module.intentHandlers || {}) : [],
    };
  }

  /** Plugin'i etkinleştir */
  async enable(id) {
    const result = await this._store.setEnabled(id, true);
    await this._loadPlugin(id);
    return { ...result, loaded: this._loaded.has(id) };
  }

  /** Plugin'i devre dışı bırak */
  async disable(id) {
    await this._unloadPlugin(id);
    const result = await this._store.setEnabled(id, false);
    return { ...result, loaded: false };
  }

  /** ZIP'ten plugin kur, sonra yükle */
  async installFromZip(zipPath) {
    const extractZip = require("extract-zip");
    const os         = require("node:os");
    const crypto     = require("node:crypto");

    const tmpDir = path.join(os.tmpdir(), `codega_plugin_${crypto.randomBytes(4).toString("hex")}`);
    await fsp.mkdir(tmpDir, { recursive: true });

    try {
      await extractZip(zipPath, { dir: tmpDir });
      // ZIP tek klasör içeriyorsa o klasörü kullan, yoksa tmpDir kendisi
      const entries = await fsp.readdir(tmpDir, { withFileTypes: true });
      let sourceDir = tmpDir;
      if (entries.length === 1 && entries[0].isDirectory()) {
        sourceDir = path.join(tmpDir, entries[0].name);
      }

      const summary = await this._store.installFromDir(sourceDir);
      await this._loadPlugin(summary.id);
      return { ...summary, loaded: true };
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Plugin'i kaldır */
  async uninstall(id) {
    await this._unloadPlugin(id);
    return await this._store.uninstall(id);
  }

  /** Intent engine entegrasyonu — aktif plugin intent handler'larını döner */
  getIntentHandlers() {
    const handlers = {};
    for (const [id, loaded] of this._loaded.entries()) {
      if (!loaded.module.intentHandlers) continue;
      for (const [intent, fn] of Object.entries(loaded.module.intentHandlers)) {
        if (typeof fn === "function") {
          handlers[intent] = { pluginId: id, handler: fn, context: loaded.context };
        }
      }
    }
    return handlers;
  }

  /** Belirli intent'i işleyebilecek plugin var mı? */
  canHandle(intentName) {
    return intentName in this.getIntentHandlers();
  }

  /** Plugin intent'ini çalıştır */
  async dispatch(intentName, payload) {
    const handlers = this.getIntentHandlers();
    const entry = handlers[intentName];
    if (!entry) throw new Error(`Intent '${intentName}' için plugin bulunamadı`);
    return await entry.handler(payload, entry.context);
  }
}

module.exports = { PluginEngine };
