"use strict";

/**
 * learning-db.js — CODEGA AI Mühendislik Öğrenme Veritabanı
 *
 * Sprint XX: Autonomous Evolution Platform (AEP)
 *
 * Her şey birer öğrenme fırsatıdır:
 *   - Çözülen bug → bilgi
 *   - Başarısız patch → bilgi
 *   - Başarılı mimari karar → bilgi
 *   - Reddedilen PR → bilgi
 *   - DNA değerlendirmesi → bilgi
 *
 * AI kendi mühendislik yargısını sürekli iyileştirir.
 */

const fs   = require("node:fs");
const path = require("node:path");

// ── Öğrenme Türleri ───────────────────────────────────────────────────────────

const LEARNING_TYPE = Object.freeze({
  BUG_FIX           : "bug_fix",
  FAILED_PATCH      : "failed_patch",
  SUCCESSFUL_PATCH  : "successful_patch",
  ARCH_DECISION     : "arch_decision",
  REJECTED_PR       : "rejected_pr",
  MERGED_PR         : "merged_pr",
  DNA_EVALUATION    : "dna_evaluation",
  PERF_WIN          : "performance_win",
  SECURITY_FIX      : "security_fix",
  TEST_INSIGHT      : "test_insight",
});

const CONFIDENCE = Object.freeze({ LOW: "low", MEDIUM: "medium", HIGH: "high" });

// ── Entry Fabrikası ───────────────────────────────────────────────────────────

function createEntry({
  type,
  title,
  context    = "",
  lesson     = "",
  outcome    = "",
  confidence = CONFIDENCE.MEDIUM,
  tags       = [],
  relatedIds = [],   // task / proposal / PR ID'leri
  version    = null,
} = {}) {
  if (!type)  throw new Error("LearningEntry: type zorunlu");
  if (!title) throw new Error("LearningEntry: title zorunlu");
  return {
    id        : "LE-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase(),
    type,
    title     : String(title).trim(),
    context   : String(context).trim(),
    lesson    : String(lesson).trim(),
    outcome   : String(outcome).trim(),
    confidence,
    tags      : Array.isArray(tags) ? tags : [],
    relatedIds: Array.isArray(relatedIds) ? relatedIds : [],
    version,
    createdAt : Date.now(),
    useCount  : 0,   // bu öğrenme kaç kez uygulandı
  };
}

// ── LearningDatabase Sınıfı ───────────────────────────────────────────────────

class LearningDatabase {
  constructor(dataDir) {
    this._dataDir  = dataDir;
    this._filePath = path.join(dataDir, "learning-db.json");
    this._entries  = new Map();  // id → entry
  }

  init() {
    try {
      fs.mkdirSync(this._dataDir, { recursive: true });
      if (fs.existsSync(this._filePath)) {
        const raw = JSON.parse(fs.readFileSync(this._filePath, "utf8"));
        for (const e of (raw.entries || [])) this._entries.set(e.id, e);
      }
    } catch (e) {
      console.warn("[LearningDB] init:", e.message);
    }
    return this;
  }

  _save() {
    try {
      fs.writeFileSync(this._filePath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        entries: [...this._entries.values()],
      }, null, 2), "utf8");
    } catch (e) {
      console.warn("[LearningDB] save:", e.message);
    }
  }

  /** Öğrenme ekle */
  add(opts) {
    const entry = createEntry(opts);
    this._entries.set(entry.id, entry);
    this._save();
    return entry;
  }

  /** Patch sonucundan öğrenme çıkar */
  learnFromPatch(task, proposal, patchResult) {
    const success = patchResult.status === "pr_open";
    const type = success ? LEARNING_TYPE.SUCCESSFUL_PATCH : LEARNING_TYPE.FAILED_PATCH;

    return this.add({
      type,
      title    : `${success ? "✓" : "✗"} Patch: ${task.title}`,
      context  : `Görev: ${task.category} / ${task.severity}. Öneri tipi: ${proposal.type}.`,
      lesson   : success
        ? `Bu kategoride (${task.category}) ${proposal.type} yaklaşımı işe yaradı.`
        : `Bu kategoride başarısız: ${patchResult.error || "bilinmeyen hata"}`,
      outcome  : success ? `PR #${patchResult.prNumber} açıldı.` : "Patch oluşturulamadı.",
      confidence: success ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
      tags     : [task.category, proposal.type, success ? "success" : "failure"],
      relatedIds: [task.id, proposal.id],
    });
  }

  /** DNA değerlendirmesinden öğren */
  learnFromDNA(dnaResult) {
    const verdict = dnaResult.verdict;
    return this.add({
      type   : LEARNING_TYPE.DNA_EVALUATION,
      title  : `DNA ${verdict}: ${dnaResult.version || "?"}`,
      context: `Toplam skor: ${dnaResult.total}/25`,
      lesson : verdict === "FAILED"
        ? `Q5 (kullanıcı değeri) skoru ${dnaResult.scores?.q5}/5 — sprint anlamsız kabul edildi.`
        : verdict === "SUCCESSFUL"
        ? `Tüm boyutlarda yeterli skor. Başarılı release pattern'i kayıt altına alındı.`
        : `Sınırda geçti — iyileştirme alanları: ${_lowScoreAreas(dnaResult.scores).join(", ")}`,
      outcome   : `Release: ${verdict}`,
      confidence: CONFIDENCE.HIGH,
      tags      : ["dna", verdict.toLowerCase()],
      version   : dnaResult.version,
    });
  }

  /** PR reddedildi */
  learnFromRejectedPR(task, proposal, reason) {
    return this.add({
      type      : LEARNING_TYPE.REJECTED_PR,
      title     : `Reddedilen PR: ${task.title}`,
      context   : `Görev: ${task.id}, Öneri: ${proposal.id}`,
      lesson    : `İnsan incelemesinde reddedildi: ${reason}`,
      outcome   : "Patch uygulanmadı. Geri dönülerek yeniden tasarlanmalı.",
      confidence: CONFIDENCE.HIGH,
      tags      : [task.category, "rejected"],
      relatedIds: [task.id, proposal.id],
    });
  }

  /** Kullanım sayacını artır */
  markUsed(id) {
    const e = this._entries.get(id);
    if (!e) return;
    e.useCount = (e.useCount || 0) + 1;
    this._save();
  }

  /** Arama: tag veya tip bazlı */
  query({ type = null, tag = null, confidence = null, limit = 20 } = {}) {
    let entries = [...this._entries.values()];
    if (type)       entries = entries.filter(e => e.type === type);
    if (tag)        entries = entries.filter(e => e.tags.includes(tag));
    if (confidence) entries = entries.filter(e => e.confidence === confidence);
    entries.sort((a, b) => b.createdAt - a.createdAt);
    return entries.slice(0, limit);
  }

  /** Benzer kategori için geçmiş dersler */
  relevantLessons(category, type, limit = 5) {
    return this.query({ tag: category, limit: limit * 3 })
      .filter(e => e.confidence !== CONFIDENCE.LOW)
      .slice(0, limit);
  }

  summary() {
    const all = [...this._entries.values()];
    const byType = {};
    for (const e of all) byType[e.type] = (byType[e.type] || 0) + 1;
    const recentLessons = all.slice(-5).reverse().map(e => ({ id: e.id, title: e.title, type: e.type }));
    return {
      total        : all.length,
      byType,
      recentLessons,
      successRate  : _calcSuccessRate(all),
    };
  }
}

function _lowScoreAreas(scores = {}) {
  return Object.entries(scores).filter(([, v]) => v <= 2).map(([k]) => k);
}

function _calcSuccessRate(entries) {
  const patches = entries.filter(e =>
    e.type === LEARNING_TYPE.SUCCESSFUL_PATCH || e.type === LEARNING_TYPE.FAILED_PATCH
  );
  if (!patches.length) return null;
  const success = patches.filter(e => e.type === LEARNING_TYPE.SUCCESSFUL_PATCH).length;
  return Math.round((success / patches.length) * 100);
}

module.exports = { LearningDatabase, createEntry, LEARNING_TYPE, CONFIDENCE };
