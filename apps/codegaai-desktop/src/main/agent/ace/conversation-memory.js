"use strict";
/**
 * Layer 3: Conversation Memory — Semantik Özet Hafızası
 * Lifetime: sohbet boyunca, sonra proje beyniyle birleşir.
 *
 * ASLA ham mesaj saklanmaz.
 * "We discussed Builder architecture." gibi anlamsal özetler.
 *
 * Her sohbet sonunda self-reflector bu katmanı besler.
 */
const fs   = require("node:fs");
const path = require("node:path");

const MAX_SUMMARIES = 200;

class ConversationMemory {
  constructor(dataDir) {
    this._dataDir = dataDir;
    this._path    = path.join(dataDir, "conversation-memory.json");
    this._summaries = [];   // { id, projectLabel, summary, topics, decisions, at }
    this._current   = null; // bu oturumun birikimi
  }

  init() {
    try {
      fs.mkdirSync(this._dataDir, { recursive: true });
      if (fs.existsSync(this._path)) {
        const raw = JSON.parse(fs.readFileSync(this._path, "utf8"));
        this._summaries = raw.summaries || [];
      }
    } catch (e) {
      console.warn("[ConversationMemory] init:", e.message);
    }
    this._current = { topics: [], decisions: [], insights: [], projectLabel: null, startedAt: Date.now() };
    return this;
  }

  _save() {
    try {
      fs.writeFileSync(this._path, JSON.stringify({
        version  : 1,
        savedAt  : Date.now(),
        summaries: this._summaries.slice(-MAX_SUMMARIES),
      }, null, 2), "utf8");
    } catch (e) {
      console.warn("[ConversationMemory] save:", e.message);
    }
  }

  setProject(label) { if (this._current) this._current.projectLabel = label; }

  /** Sohbet sırasında konu ekle (raw mesaj değil, özet) */
  addTopic(summary) {
    if (!this._current) return;
    const s = String(summary || "").trim();
    if (s && !this._current.topics.includes(s)) this._current.topics.push(s);
  }

  /** Alınan karar ekle */
  addDecision(decision) {
    if (!this._current) return;
    this._current.decisions.push({ text: String(decision), at: Date.now() });
  }

  /** İçgörü ekle */
  addInsight(insight) {
    if (!this._current) return;
    this._current.insights.push(String(insight).trim());
  }

  /**
   * Sohbet bitişinde semantik özeti kaydet.
   * @param {string} summary  — LLM veya kural tabanlı özet
   */
  commit(summary, projectLabel) {
    if (!this._current) return;
    if (projectLabel) this._current.projectLabel = projectLabel;
    const entry = {
      id          : "CM-" + Date.now().toString(36).toUpperCase(),
      projectLabel: this._current.projectLabel,
      summary     : String(summary || "").trim() || this._autoSummary(),
      topics      : [...this._current.topics],
      decisions   : [...this._current.decisions],
      insights    : [...this._current.insights],
      duration    : Date.now() - this._current.startedAt,
      at          : Date.now(),
    };
    if (entry.summary) {
      this._summaries.push(entry);
      this._save();
    }
    // Yeni oturum başlat
    this._current = { topics: [], decisions: [], insights: [], projectLabel: null, startedAt: Date.now() };
    return entry;
  }

  _autoSummary() {
    if (!this._current) return "";
    const parts = [];
    if (this._current.topics.length) parts.push(this._current.topics.join(". "));
    if (this._current.decisions.length) {
      parts.push("Kararlar: " + this._current.decisions.map(d => d.text).join("; "));
    }
    return parts.join(" | ").slice(0, 500);
  }

  /** Belirli proje için geçmiş özetler */
  forProject(projectLabel, limit = 10) {
    const l = String(projectLabel || "").toLowerCase();
    return this._summaries
      .filter(s => !l || (s.projectLabel || "").toLowerCase() === l)
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);
  }

  /** Son N özet */
  recent(n = 5) {
    return this._summaries.slice(-n).reverse();
  }

  /** Mevcut oturum durumu */
  currentSession() {
    return this._current ? { ...this._current } : null;
  }

  summary() {
    return {
      total        : this._summaries.length,
      recentTopics : this._summaries.slice(-3).flatMap(s => s.topics).slice(0, 5),
      currentTopics: this._current?.topics || [],
    };
  }
}
module.exports = { ConversationMemory };
