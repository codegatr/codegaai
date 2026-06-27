"use strict";

/**
 * project-store.js — Proje hafızası için JSON-dosya tabanlı depolama katmanı.
 *
 * Her proje kendi JSON dosyasında saklanır:
 *   <userData>/project-memories/<id>.json
 *
 * Tasarım kuralı: Projeler asla birbirine karışmaz.
 * Her get/save/delete işlemi yalnızca kendi dosyasını etkiler.
 */

const path   = require("node:path");
const fsp    = require("node:fs/promises");
const crypto = require("node:crypto");

/** Proje ID → dosya yolu eşlemesi (path traversal koruması) */
function safeFilename(id) {
  return path.basename(String(id || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64)) + ".json";
}

class ProjectStore {
  /**
   * @param {string} baseDir — userData altındaki proje hafıza klasörü
   */
  constructor(baseDir) {
    this._dir   = baseDir;
    this._cache = new Map(); // id → project (LRU değil; basit in-memory cache)
  }

  async _ensureDir() {
    await fsp.mkdir(this._dir, { recursive: true });
  }

  _filePath(id) {
    return path.join(this._dir, safeFilename(id));
  }

  /** Tüm projelerin özet listesini döner (brain yüklenmez → hızlı). */
  async list() {
    await this._ensureDir();
    let files;
    try { files = await fsp.readdir(this._dir); } catch (_e) { return []; }
    const result = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw  = await fsp.readFile(path.join(this._dir, f), "utf8");
        const data = JSON.parse(raw);
        result.push({
          id:        data.id,
          name:      data.name,
          slug:      data.slug,
          stack:     data.stack || "",
          repoUrl:   data.repoUrl || "",
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          entryCount: this._countEntries(data.brain),
        });
      } catch (_e) { /* bozuk dosyayı atla */ }
    }
    return result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  _countEntries(brain = {}) {
    return Object.values(brain).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
  }

  /** Tek projeyi tam olarak yükler (brain dahil). */
  async get(id) {
    if (this._cache.has(id)) return this._cache.get(id);
    try {
      const raw  = await fsp.readFile(this._filePath(id), "utf8");
      const data = JSON.parse(raw);
      this._cache.set(id, data);
      return data;
    } catch (_e) {
      return null;
    }
  }

  /** Projeyi kaydeder/günceller. */
  async save(project) {
    await this._ensureDir();
    if (!project.id) throw new Error("Proje ID gerekli");
    project.updatedAt = Date.now();
    const json = JSON.stringify(project, null, 2);
    await fsp.writeFile(this._filePath(project.id), json, "utf8");
    this._cache.set(project.id, project);
    return project;
  }

  /** Projeyi ve dosyasını siler. */
  async delete(id) {
    this._cache.delete(id);
    try {
      await fsp.unlink(this._filePath(id));
      return true;
    } catch (_e) {
      return false;
    }
  }

  /** Önbelleği temizler (test/reload için). */
  clearCache() {
    this._cache.clear();
  }

  /** Yeni benzersiz proje ID'si üretir. */
  static newId() {
    return `proj_${crypto.randomBytes(6).toString("hex")}`;
  }

  /** Yeni boş proje iskelet nesnesi döner. */
  static scaffold(name, opts = {}) {
    const slug = (opts.slug || name || "")
      .toLowerCase()
      .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
      .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      .slice(0, 60);

    return {
      id:           ProjectStore.newId(),
      name:         String(name || "İsimsiz Proje"),
      slug,
      createdAt:    Date.now(),
      updatedAt:    Date.now(),
      stack:        opts.stack        || "",
      repoUrl:      opts.repoUrl      || "",
      detectedFrom: opts.detectedFrom || "manual",
      description:  opts.description  || "",
      brain: {
        architecture:    [],  // Sistem tasarımı, katmanlar, bileşenler
        tech_stack:      [],  // Kullanılan teknolojiler, kütüphaneler, sürümler
        business_rules:  [],  // Alan mantığı, iş kuralları
        naming:          [],  // İsimlendirme kuralları, kod stili
        schema:          [],  // Veritabanı şeması, tablolar, ilişkiler
        decisions:       [],  // Mimari kararlar (ADR)
        tech_debt:       [],  // Bilinen teknik borçlar
        pending_work:    [],  // Yapılacaklar, özellik talepleri
        release_history: [],  // Sürüm geçmişi
        known_bugs:      [],  // Bilinen hatalar
        standards:       [],  // Kodlama standartları, kurallar
      },
    };
  }
}

module.exports = { ProjectStore };
