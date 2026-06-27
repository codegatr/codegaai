"use strict";

/**
 * rule-store.js — CODEGA AI Execution Memory
 *
 * Öğrenilmiş kuralları diskten okur/yazar, bağlama göre sorgular.
 *
 * Güvenlik modeli:
 *  - Her kural max MAX_LESSON_LENGTH karakter (prompt injection engeli)
 *  - Plugin kaynaklı kurallar trusted:false ile işaretlenir
 *  - Confidence < PRUNE_THRESHOLD olan kurallar budanır
 *  - Toplam kural sayısı MAX_RULES ile sınırlandırılır
 */

const fsp  = require("node:fs/promises");
const path = require("node:path");

const PRUNE_THRESHOLD  = 0.20;   // Bu confidence'ın altı budanır
const MAX_RULES        = 200;    // Toplam kural limiti
const MAX_QUERY_RESULT = 5;      // Tek sorguda max kural
const MAX_LESSON_LENGTH = 400;   // Güvenlik: lesson boyut sınırı

class RuleStore {
  /** @param {string} dataDir — kural dosyasının yazılacağı dizin */
  constructor(dataDir) {
    this._path  = path.join(dataDir, "rules.json");
    this._rules = new Map();   // id → rule
  }

  /** Diskten yükle (idempotent) */
  async init() {
    await fsp.mkdir(path.dirname(this._path), { recursive: true });
    try {
      const text  = await fsp.readFile(this._path, "utf8");
      const rules = JSON.parse(text);
      for (const rule of rules) {
        if (rule.id) this._rules.set(rule.id, _sanitize(rule));
      }
    } catch {
      // Yeni kurulum — boş store
    }
  }

  /**
   * Kuralı ekle veya güncelle.
   * Zaten varsa confidence ağırlıklı ortalama ile birleştirilir.
   */
  async upsert(rule) {
    if (!rule || !rule.id) throw new Error("Kural id alanı zorunlu");
    const safe     = _sanitize(rule);
    const existing = this._rules.get(safe.id);

    if (existing) {
      const totalSamples  = existing.samples + safe.samples;
      safe.confidence     = (existing.confidence * existing.samples +
                              safe.confidence    * safe.samples) / totalSamples;
      safe.confidence     = Math.round(safe.confidence * 1000) / 1000;
      safe.samples        = totalSamples;
      safe.active         = safe.confidence >= 0.50;
      safe.errorCodes     = [...new Set([...(existing.errorCodes || []), ...(safe.errorCodes || [])])].slice(0, 5);
    }

    this._rules.set(safe.id, safe);
    await this._persist();
    return safe;
  }

  /**
   * Bağlama uyan aktif kuralları döndür.
   * @param {{ agentId?, stack?, features? }} context
   */
  query(context = {}) {
    const results = [];
    for (const rule of this._rules.values()) {
      if (!rule.active)                     continue;
      if (!_matchesContext(rule, context))  continue;
      results.push(rule);
    }
    return results
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_QUERY_RESULT);
  }

  /** Tüm kuralları döndür */
  list() {
    return [...this._rules.values()];
  }

  /**
   * Düşük confidence ve fazla kuralları temizle.
   * Her record() sonrası otomatik çağrılır.
   */
  async prune() {
    let changed = false;

    for (const [id, rule] of this._rules) {
      if (!rule.active || rule.confidence < PRUNE_THRESHOLD) {
        this._rules.delete(id);
        changed = true;
      }
    }

    if (this._rules.size > MAX_RULES) {
      const sorted = [...this._rules.values()].sort((a, b) => b.confidence - a.confidence);
      this._rules.clear();
      for (const r of sorted.slice(0, MAX_RULES)) this._rules.set(r.id, r);
      changed = true;
    }

    if (changed) await this._persist();
  }

  /** Tüm kuralları sil */
  async clear() {
    this._rules.clear();
    await this._persist();
  }

  // ── private ─────────────────────────────────────────────────────

  async _persist() {
    await fsp.writeFile(
      this._path,
      JSON.stringify([...this._rules.values()], null, 2),
      "utf8"
    );
  }
}

// ── Yardımcı ─────────────────────────────────────────────────────

function _sanitize(rule) {
  return {
    ...rule,
    lesson:  (rule.lesson || "").slice(0, MAX_LESSON_LENGTH),
    trusted: rule.trusted !== false,  // default true
  };
}

function _matchesContext(rule, query) {
  const rc = rule.context  || {};
  const qc = query         || {};

  // agentId eşleşmesi
  if (rc.agentId && qc.agentId && rc.agentId !== qc.agentId) return false;

  // stack eşleşmesi
  if (rc.stack && qc.stack && rc.stack !== qc.stack) return false;

  // Feature kesişimi — en az bir feature ortak olmalı
  if (rc.features?.length && qc.features?.length) {
    const overlap = rc.features.some(f => qc.features.includes(f));
    if (!overlap) return false;
  }

  return true;
}

module.exports = RuleStore;
