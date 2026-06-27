"use strict";

/**
 * project-engine.js — Proje hafızası iş mantığı katmanı.
 *
 * Sorumluluklar:
 *   - Proje oluşturma / güncelleme / silme
 *   - Brain kategorilerine giriş ekleme / silme
 *   - Tüm kategorilerde tam metin arama
 *   - Git/ZIP sonuçlarından otomatik proje tespiti
 *   - Sohbet bağlamı için AI özeti üretme
 *
 * Güvenlik kuralı: Hiçbir işlem proje ID doğrulaması olmadan çalışmaz.
 */

const { ProjectStore } = require("./project-store");

// Geçerli brain kategorileri
const BRAIN_CATEGORIES = new Set([
  "architecture",
  "tech_stack",
  "business_rules",
  "naming",
  "schema",
  "decisions",
  "tech_debt",
  "pending_work",
  "release_history",
  "known_bugs",
  "standards",
]);

const CATEGORY_LABELS = {
  architecture:    "Mimari",
  tech_stack:      "Teknoloji Stack",
  business_rules:  "İş Kuralları",
  naming:          "İsimlendirme",
  schema:          "Veritabanı Şeması",
  decisions:       "Mimari Kararlar",
  tech_debt:       "Teknik Borç",
  pending_work:    "Yapılacaklar",
  release_history: "Sürüm Geçmişi",
  known_bugs:      "Bilinen Hatalar",
  standards:       "Standartlar",
};

class ProjectEngine {
  /**
   * @param {ProjectStore} store
   */
  constructor(store) {
    this._store = store;
  }

  // ─────────────────────────────────────────────
  // Proje CRUD
  // ─────────────────────────────────────────────

  /** Yeni proje oluşturur. */
  async create(name, opts = {}) {
    if (!name || !String(name).trim()) throw new Error("Proje adı boş olamaz");
    const project = ProjectStore.scaffold(String(name).trim(), opts);
    return this._store.save(project);
  }

  /** Tüm projelerin özetini döner. */
  async list() {
    return this._store.list();
  }

  /** Tek proje döner (brain dahil). */
  async get(id) {
    const project = await this._store.get(id);
    if (!project) throw new Error(`Proje bulunamadı: ${id}`);
    return project;
  }

  /** Proje meta alanlarını günceller (brain değil). */
  async updateMeta(id, patch = {}) {
    const project = await this.get(id);
    const allowed = ["name", "slug", "stack", "repoUrl", "description"];
    for (const key of allowed) {
      if (patch[key] !== undefined) project[key] = patch[key];
    }
    return this._store.save(project);
  }

  /** Projeyi siler. */
  async delete(id) {
    await this.get(id); // var mı kontrol et
    return this._store.delete(id);
  }

  // ─────────────────────────────────────────────
  // Brain — Kategori işlemleri
  // ─────────────────────────────────────────────

  _validateCategory(category) {
    if (!BRAIN_CATEGORIES.has(category)) {
      throw new Error(`Geçersiz kategori: ${category}. Geçerliler: ${[...BRAIN_CATEGORIES].join(", ")}`);
    }
  }

  /**
   * Brain kategorisine yeni giriş ekler.
   * @param {string} id — proje ID
   * @param {string} category — brain kategorisi
   * @param {string|object} entry — metin veya nesne
   */
  async append(id, category, entry) {
    this._validateCategory(category);
    const project = await this.get(id);
    if (!project.brain[category]) project.brain[category] = [];

    const normalized = typeof entry === "string"
      ? { text: entry.trim(), addedAt: Date.now() }
      : { ...entry, addedAt: Date.now() };

    if (!normalized.text && !normalized.version && !normalized.content) {
      throw new Error("Giriş boş olamaz");
    }

    project.brain[category].push(normalized);
    return this._store.save(project);
  }

  /**
   * Brain kategorisindeki belirli bir girişi siler (index ile).
   */
  async removeEntry(id, category, index) {
    this._validateCategory(category);
    const project = await this.get(id);
    const arr = project.brain[category] || [];
    if (index < 0 || index >= arr.length) throw new Error(`Geçersiz indeks: ${index}`);
    project.brain[category] = arr.filter((_, i) => i !== index);
    return this._store.save(project);
  }

  /**
   * Tüm kategorilerdeki girişleri değiştirir (toplu güncelleme).
   */
  async replaceBrainCategory(id, category, entries) {
    this._validateCategory(category);
    const project = await this.get(id);
    project.brain[category] = (entries || []).map((e) =>
      typeof e === "string" ? { text: e.trim(), addedAt: Date.now() } : e
    );
    return this._store.save(project);
  }

  // ─────────────────────────────────────────────
  // Arama
  // ─────────────────────────────────────────────

  /**
   * Proje brain'inde tam metin arama.
   * @param {string} id — proje ID
   * @param {string} query — arama terimi
   * @returns {{ category, index, entry, score }[]}
   */
  async search(id, query) {
    if (!query || !query.trim()) return [];
    const project = await this.get(id);
    const terms = query.trim().toLowerCase().split(/\s+/);
    const results = [];

    for (const [cat, entries] of Object.entries(project.brain)) {
      if (!Array.isArray(entries)) continue;
      for (let i = 0; i < entries.length; i++) {
        const text = JSON.stringify(entries[i]).toLowerCase();
        const score = terms.filter((t) => text.includes(t)).length;
        if (score > 0) {
          results.push({
            category: cat,
            categoryLabel: CATEGORY_LABELS[cat] || cat,
            index: i,
            entry: entries[i],
            score,
          });
        }
      }
    }
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Tüm projelerde arama (proje başlığı + brain içeriği).
   */
  async searchAll(query) {
    if (!query || !query.trim()) return [];
    const projects = await this._store.list();
    const results = [];
    for (const p of projects) {
      const hits = await this.search(p.id, query);
      if (hits.length) results.push({ project: p, hits });
    }
    return results;
  }

  // ─────────────────────────────────────────────
  // Otomatik Tespit
  // ─────────────────────────────────────────────

  /**
   * Git depo sonucundan veya ZIP analiz sonucundan proje tespit eder.
   * Eşleşen proje varsa onu döner; yoksa yeni proje oluşturur.
   *
   * @param {{ repoUrl?, name?, stack?, description? }} hints
   */
  async detectOrCreate(hints = {}) {
    const projects = await this._store.list();

    // repoUrl ile eşleşme ara
    if (hints.repoUrl) {
      const norm = (u) => String(u || "").toLowerCase().replace(/\.git$/, "").replace(/\/$/, "");
      const match = projects.find((p) => norm(p.repoUrl) === norm(hints.repoUrl));
      if (match) return this._store.get(match.id);
    }

    // İsim benzerliğiyle eşleşme ara
    if (hints.name) {
      const normName = String(hints.name || "").toLowerCase().trim();
      const match = projects.find((p) => p.name.toLowerCase().trim() === normName || p.slug === normName);
      if (match) return this._store.get(match.id);
    }

    // Yeni proje oluştur
    return this.create(hints.name || "Yeni Proje", {
      stack:        hints.stack        || "",
      repoUrl:      hints.repoUrl      || "",
      detectedFrom: hints.detectedFrom || "auto",
      description:  hints.description  || "",
    });
  }

  // ─────────────────────────────────────────────
  // AI Bağlamı
  // ─────────────────────────────────────────────

  /**
   * LLM'e göndermek için proje özetini düz metin olarak üretir.
   * Token tasarrufu için her kategoriden max N giriş alır.
   *
   * @param {string} id
   * @param {number} maxPerCategory
   */
  async buildContext(id, maxPerCategory = 5) {
    const project = await this.get(id);
    const lines = [
      `# Proje: ${project.name}`,
      project.stack        ? `Stack: ${project.stack}` : "",
      project.repoUrl      ? `Repo: ${project.repoUrl}` : "",
      project.description  ? `Açıklama: ${project.description}` : "",
      "",
    ].filter((l) => l !== undefined);

    for (const [cat, label] of Object.entries(CATEGORY_LABELS)) {
      const entries = project.brain[cat] || [];
      if (!entries.length) continue;
      lines.push(`## ${label}`);
      entries.slice(-maxPerCategory).forEach((e) => {
        const text = e.text || e.content || (e.version ? `v${e.version}: ${e.notes || ""}` : JSON.stringify(e));
        lines.push(`- ${text}`);
      });
      lines.push("");
    }
    return lines.join("\n");
  }
}

module.exports = { ProjectEngine, BRAIN_CATEGORIES, CATEGORY_LABELS };
