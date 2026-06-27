"use strict";

/**
 * engineering-score.js — CODEGA AI Mühendislik Skorkartı
 *
 * Sprint XX: Autonomous Evolution Platform (AEP)
 *
 * Her release sonrası skorkart hesaplanır ve kaydedilir.
 * Her release en az bir skoru iyileştirmelidir (CODEGA DNA kuralı).
 *
 * Skorlar:
 *   architecture  — mimari kalite (0–100)
 *   performance   — yanıt süresi / kaynak kullanımı (0–100)
 *   builder       — builder engine kalitesi (0–100)
 *   memory        — hafıza sızıntısı riski (0–100, yüksek = iyi)
 *   reliability   — hata oranı / uptime (0–100)
 *   regression    — regresyon baskısı (0–100, yüksek = düşük risk)
 *   security      — güvenlik skoru (0–100)
 *   testCoverage  — test kapsama (0–100)
 *   techDebt      — teknik borç ters skoru (0–100, yüksek = az borç)
 *   missionSuccess— mission tamamlama oranı (0–100)
 */

const fs   = require("node:fs");
const path = require("node:path");

// ── Metrik Tanımları ──────────────────────────────────────────────────────────

const METRIC_KEYS = [
  "architecture",
  "performance",
  "builder",
  "memory",
  "reliability",
  "regression",
  "security",
  "testCoverage",
  "techDebt",
  "missionSuccess",
];

const METRIC_WEIGHTS = {
  architecture  : 1.5,
  performance   : 1.2,
  builder       : 1.0,
  memory        : 0.8,
  reliability   : 1.3,
  regression    : 1.2,
  security      : 1.5,
  testCoverage  : 1.0,
  techDebt      : 1.0,
  missionSuccess: 1.0,
};

const TOTAL_WEIGHT = Object.values(METRIC_WEIGHTS).reduce((a, b) => a + b, 0);

// ── Skor Fabrikası ────────────────────────────────────────────────────────────

function createScorecard({
  version,
  metrics = {},
  source  = "auto",  // "auto" | "manual"
  notes   = "",
} = {}) {
  if (!version) throw new Error("Scorecard: version zorunlu");

  const m = {};
  for (const key of METRIC_KEYS) {
    m[key] = clamp(Number(metrics[key]) || 50);
  }

  const overall = calcOverall(m);

  return {
    version,
    metrics : m,
    overall,
    grade   : calcGrade(overall),
    source,
    notes   : String(notes).trim(),
    createdAt: Date.now(),
  };
}

function clamp(v) { return Math.min(100, Math.max(0, Math.round(v))); }

function calcOverall(metrics) {
  let weighted = 0;
  for (const key of METRIC_KEYS) {
    weighted += (metrics[key] || 0) * (METRIC_WEIGHTS[key] || 1);
  }
  return Math.round(weighted / TOTAL_WEIGHT);
}

function calcGrade(overall) {
  if (overall >= 90) return "A+";
  if (overall >= 80) return "A";
  if (overall >= 70) return "B";
  if (overall >= 60) return "C";
  if (overall >= 50) return "D";
  return "F";
}

// ── Delta Hesaplama ───────────────────────────────────────────────────────────

/**
 * İki skorkart arasındaki farkı hesapla.
 * @returns {{ improved: string[], regressed: string[], unchanged: string[], overallDelta: number }}
 */
function calcDelta(current, previous) {
  if (!previous) return { improved: METRIC_KEYS, regressed: [], unchanged: [], overallDelta: 0 };

  const improved  = [];
  const regressed = [];
  const unchanged = [];

  for (const key of METRIC_KEYS) {
    const delta = (current.metrics[key] || 0) - (previous.metrics[key] || 0);
    if (delta > 0) improved.push(key);
    else if (delta < 0) regressed.push(key);
    else unchanged.push(key);
  }

  return {
    improved,
    regressed,
    unchanged,
    overallDelta: current.overall - previous.overall,
  };
}

// ── EngineeringScorecard Sınıfı ───────────────────────────────────────────────

class EngineeringScorecard {
  constructor(dataDir) {
    this._dataDir  = dataDir;
    this._filePath = path.join(dataDir, "engineering-scores.json");
    this._scores   = [];   // chrono order, newest last
  }

  init() {
    try {
      fs.mkdirSync(this._dataDir, { recursive: true });
      if (fs.existsSync(this._filePath)) {
        const raw = JSON.parse(fs.readFileSync(this._filePath, "utf8"));
        this._scores = raw.scores || [];
      }
    } catch (e) {
      console.warn("[EngineeringScorecard] init:", e.message);
    }
    return this;
  }

  _save() {
    try {
      fs.writeFileSync(this._filePath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        scores : this._scores.slice(-50),  // son 50 sürüm
      }, null, 2), "utf8");
    } catch (e) {
      console.warn("[EngineeringScorecard] save:", e.message);
    }
  }

  /** Yeni skorkart kaydet */
  record(opts) {
    const scorecard = createScorecard(opts);
    // Aynı versiyon varsa güncelle
    const idx = this._scores.findIndex(s => s.version === scorecard.version);
    if (idx >= 0) this._scores[idx] = scorecard;
    else this._scores.push(scorecard);
    this._save();
    return scorecard;
  }

  /** Gelişimden otomatik skor üret (EvolutionReport'tan) */
  recordFromEvolution(version, evolutionReport) {
    const r = evolutionReport?.scores || {};
    return this.record({
      version,
      source: "auto",
      metrics: {
        architecture : r.architecture   || 50,
        performance  : r.complexity     || 50,
        builder      : 60,
        memory       : 70,
        reliability  : 70,
        regression   : r.maintainability || 50,
        security     : 65,
        testCoverage : r.testCoverage   || 0,
        techDebt     : r.maintainability || 50,
        missionSuccess: 70,
      },
    });
  }

  latest()          { return this._scores[this._scores.length - 1] || null; }
  getByVersion(v)   { return this._scores.find(s => s.version === v) || null; }
  history(n = 10)   { return this._scores.slice(-n).reverse(); }

  /**
   * Delta: mevcut ile önceki arasındaki fark.
   * CODEGA DNA kuralı: en az 1 skor iyileşmeli.
   */
  delta() {
    const scores = this._scores;
    if (scores.length < 2) return null;
    return calcDelta(scores[scores.length - 1], scores[scores.length - 2]);
  }

  /** Release kuralı: en az 1 metrik iyileşmeliydi? */
  releasePassesDNARule() {
    const d = this.delta();
    if (!d) return true;
    return d.improved.length > 0;
  }

  /**
   * Trend: her metrik için son N sürümdeki skor ortalaması
   */
  trend(n = 5) {
    const recent = this._scores.slice(-n);
    if (!recent.length) return {};
    const trend = {};
    for (const key of METRIC_KEYS) {
      const avg = recent.reduce((s, r) => s + (r.metrics[key] || 0), 0) / recent.length;
      trend[key] = Math.round(avg);
    }
    trend.overall = Math.round(recent.reduce((s, r) => s + r.overall, 0) / recent.length);
    return trend;
  }

  summary() {
    const latest = this.latest();
    const delta  = this.delta();
    return {
      latestVersion: latest?.version || null,
      overall      : latest?.overall || 0,
      grade        : latest?.grade   || "N/A",
      metrics      : latest?.metrics || {},
      delta        : delta || {},
      historyCount : this._scores.length,
    };
  }
}

module.exports = {
  EngineeringScorecard,
  createScorecard,
  calcDelta,
  calcOverall,
  calcGrade,
  METRIC_KEYS,
  METRIC_WEIGHTS,
};
