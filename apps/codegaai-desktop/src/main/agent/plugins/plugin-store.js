"use strict";

/**
 * plugin-store.js — CODEGA AI Plugin Store
 *
 * userData/plugins/<plugin-id>/
 *   plugin.json   — manifest
 *   index.js      — entry point
 *   ... diğer dosyalar
 *
 * plugin.json şeması:
 * {
 *   "id":          "my-plugin",          // sadece [a-z0-9-_], max 64
 *   "name":        "My Plugin",
 *   "version":     "1.0.0",
 *   "description": "...",
 *   "author":      "Yazar",
 *   "entry":       "index.js",           // plugin kök dizininden relative
 *   "permissions": ["ipc", "memory"],    // talep edilen izinler (şimdilik informational)
 *   "codegaMinVersion": "6.0.0-alpha.12" // opsiyonel minimum CODEGA AI versiyonu
 * }
 */

const path   = require("node:path");
const fsp    = require("node:fs/promises");
const crypto = require("node:crypto");

const VALID_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const REQUIRED_FIELDS = ["id", "name", "version", "entry"];

function validateManifest(manifest, pluginDir) {
  for (const field of REQUIRED_FIELDS) {
    if (!manifest[field] || typeof manifest[field] !== "string") {
      throw new Error(`Plugin manifest '${pluginDir}': '${field}' alanı eksik veya geçersiz`);
    }
  }
  if (!VALID_ID.test(manifest.id)) {
    throw new Error(`Plugin '${manifest.id}': id yalnızca küçük harf, rakam, tire ve alt çizgi içerebilir`);
  }
  if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
    throw new Error(`Plugin '${manifest.id}': version semver formatında olmalı (örn. 1.0.0)`);
  }
  // Entry path traversal koruması
  const entryResolved = path.resolve(pluginDir, manifest.entry);
  if (!entryResolved.startsWith(pluginDir + path.sep) && entryResolved !== pluginDir) {
    throw new Error(`Plugin '${manifest.id}': entry path dizin dışına çıkamaz`);
  }
}

class PluginStore {
  /**
   * @param {string} baseDir — userData/plugins/ klasörü
   */
  constructor(baseDir) {
    this._dir = baseDir;
    // id → { manifest, pluginDir, enabled, installedAt, checksum }
    this._cache = new Map();
    this._stateFile = path.join(baseDir, ".state.json");
  }

  async _ensureDir() {
    await fsp.mkdir(this._dir, { recursive: true });
  }

  /** State dosyasını oku (enabled/disabled bilgisi) */
  async _loadState() {
    try {
      const raw = await fsp.readFile(this._stateFile, "utf8");
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async _saveState(state) {
    await fsp.writeFile(this._stateFile, JSON.stringify(state, null, 2), "utf8");
  }

  /** Tüm plugin'leri tara, cache'e yükle */
  async discover() {
    await this._ensureDir();
    const state = await this._loadState();
    this._cache.clear();

    let entries;
    try {
      entries = await fsp.readdir(this._dir, { withFileTypes: true });
    } catch {
      return [];
    }

    const results = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;

      const pluginDir = path.join(this._dir, entry.name);
      const manifestPath = path.join(pluginDir, "plugin.json");

      try {
        const raw = await fsp.readFile(manifestPath, "utf8");
        const manifest = JSON.parse(raw);
        validateManifest(manifest, pluginDir);

        // Klasör adı ile manifest id'si eşleşmeli
        if (manifest.id !== entry.name) {
          console.warn(`[PluginStore] Uyarı: '${entry.name}' klasörü içindeki plugin id'si '${manifest.id}' — klasör adıyla eşleşmiyor, atlanıyor.`);
          continue;
        }

        const enabled = state[manifest.id]?.enabled !== false; // default: enabled
        const installedAt = state[manifest.id]?.installedAt || null;

        const record = { manifest, pluginDir, enabled, installedAt };
        this._cache.set(manifest.id, record);
        results.push(this._summary(record));
      } catch (err) {
        console.warn(`[PluginStore] '${entry.name}' plugin yüklenemedi: ${err.message}`);
      }
    }
    return results;
  }

  /** Özet obje (brain olmadan) */
  _summary(record) {
    return {
      id:          record.manifest.id,
      name:        record.manifest.name,
      version:     record.manifest.version,
      description: record.manifest.description || "",
      author:      record.manifest.author || "",
      permissions: record.manifest.permissions || [],
      enabled:     record.enabled,
      installedAt: record.installedAt,
      pluginDir:   record.pluginDir,
    };
  }

  /** Tüm plugin özetlerini listele */
  list() {
    return [...this._cache.values()].map(r => this._summary(r));
  }

  /** Tek plugin kaydını getir */
  get(id) {
    return this._cache.get(id) || null;
  }

  /** Plugin'i enable/disable et */
  async setEnabled(id, enabled) {
    const record = this._cache.get(id);
    if (!record) throw new Error(`Plugin bulunamadı: ${id}`);
    record.enabled = enabled;
    const state = await this._loadState();
    state[id] = { ...(state[id] || {}), enabled };
    await this._saveState(state);
    return this._summary(record);
  }

  /** ZIP'ten plugin kur */
  async installFromDir(sourceDir) {
    // sourceDir zaten extract edilmiş, plugin.json içermeli
    const manifestPath = path.join(sourceDir, "plugin.json");
    const raw = await fsp.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    validateManifest(manifest, sourceDir);

    await this._ensureDir();
    const destDir = path.join(this._dir, manifest.id);

    // Mevcut versiyonu yedekle (update senaryosu)
    try {
      await fsp.rm(destDir, { recursive: true, force: true });
    } catch {}

    await fsp.cp(sourceDir, destDir, { recursive: true });

    const state = await this._loadState();
    const now = new Date().toISOString();
    state[manifest.id] = { enabled: true, installedAt: now };
    await this._saveState(state);

    const record = { manifest, pluginDir: destDir, enabled: true, installedAt: now };
    this._cache.set(manifest.id, record);
    return this._summary(record);
  }

  /** Plugin'i kaldır */
  async uninstall(id) {
    const record = this._cache.get(id);
    if (!record) throw new Error(`Plugin bulunamadı: ${id}`);

    await fsp.rm(record.pluginDir, { recursive: true, force: true });
    this._cache.delete(id);

    const state = await this._loadState();
    delete state[id];
    await this._saveState(state);
    return { id, uninstalled: true };
  }
}

module.exports = { PluginStore, validateManifest };
