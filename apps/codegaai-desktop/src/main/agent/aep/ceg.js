"use strict";

/**
 * ceg.js — CODEGA Engineering Genome (CEG)
 *
 * Sprint XX: Autonomous Evolution Platform (AEP)
 *
 * Her modül, her ajan ve her release şu soruları yanıtlar:
 *   1. Neyi iyi yapıyorum?
 *   2. Nerede başarısız oluyorum?
 *   3. Beni en çok yavaşlatan teknik borç ne?
 *   4. Hangi iyileştirme en yüksek etkiyi sağlar?
 *   5. Bu iyileştirme için otomatik bir PR hazırlayabilir miyim?
 *
 * Sonuç: CODEGA AI'nin gelişimi kullanıcı taleplerine değil,
 * kendi mühendislik verilerine dayanır.
 */

const fs   = require("node:fs");
const path = require("node:path");

// ── 5 CEG Sorusu ─────────────────────────────────────────────────────────────

const CEG_QUESTIONS = [
  { id: "q1", key: "strengths",    text: "Neyi iyi yapıyorum?" },
  { id: "q2", key: "failures",     text: "Nerede başarısız oluyorum?" },
  { id: "q3", key: "techDebt",     text: "Beni en çok yavaşlatan teknik borç ne?" },
  { id: "q4", key: "topImprovement", text: "Hangi iyileştirme en yüksek etkiyi sağlar?" },
  { id: "q5", key: "autoPRReady",  text: "Bu iyileştirme için otomatik bir PR hazırlayabilir miyim?" },
];

// ── Genome Entry ──────────────────────────────────────────────────────────────

function createGenomeEntry({
  module,
  version,
  strengths      = [],
  failures       = [],
  techDebt       = [],
  topImprovement = null,
  autoPRReady    = false,
  scores         = {},  // EngineeringScorecard.metrics
  backlogSummary = null,
  learningSummary= null,
} = {}) {
  if (!module)  throw new Error("GenomeEntry: module zorunlu");
  if (!version) throw new Error("GenomeEntry: version zorunlu");

  const healthScore = calcHealthScore({ strengths, failures, techDebt, scores });

  return {
    id            : `CEG-${module}-${version}`,
    module,
    version,
    createdAt     : Date.now(),
    healthScore,
    healthGrade   : calcHealthGrade(healthScore),
    answers: {
      q1_strengths       : strengths,
      q2_failures        : failures,
      q3_techDebt        : techDebt,
      q4_topImprovement  : topImprovement,
      q5_autoPRReady     : Boolean(autoPRReady),
    },
    scores,
    backlogSummary,
    learningSummary,
    evolutionVector: calcEvolutionVector({ strengths, failures, techDebt }),
  };
}

// ── Skor Hesaplama ────────────────────────────────────────────────────────────

function calcHealthScore({ strengths, failures, techDebt, scores }) {
  const base = (
    (scores.architecture || 50) +
    (scores.reliability  || 50) +
    (scores.testCoverage || 50) +
    (scores.security     || 50)
  ) / 4;

  const penalty = Math.min(30, failures.length * 5 + techDebt.length * 3);
  const bonus   = Math.min(10, strengths.length * 2);
  return Math.round(Math.max(0, Math.min(100, base - penalty + bonus)));
}

function calcHealthGrade(score) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 55) return "Acceptable";
  if (score >= 40) return "Needs Work";
  return "Critical";
}

/**
 * Evolution Vector: AI'nin hangi yönde evrimlenmesi gerektiğini gösterir.
 * { direction: "forward|maintenance|repair", focus: string }
 */
function calcEvolutionVector({ strengths, failures, techDebt }) {
  if (failures.length >= 3 || techDebt.length >= 5) {
    return { direction: "repair", focus: "Önce mevcut sorunları çöz — yeni özellik ekleme" };
  }
  if (techDebt.length >= 3) {
    return { direction: "maintenance", focus: "Teknik borcu azalt, temeli güçlendir" };
  }
  return { direction: "forward", focus: "Yeni yetenekler ekle, rakiplerden farklılaş" };
}

// ── CEG Sınıfı ────────────────────────────────────────────────────────────────

class CODEGAEG {
  constructor(dataDir) {
    this._dataDir  = dataDir;
    this._filePath = path.join(dataDir, "ceg-genome.json");
    this._genome   = new Map();  // `${module}-${version}` → entry
  }

  init() {
    try {
      fs.mkdirSync(this._dataDir, { recursive: true });
      if (fs.existsSync(this._filePath)) {
        const raw = JSON.parse(fs.readFileSync(this._filePath, "utf8"));
        for (const e of (raw.genome || [])) this._genome.set(e.id, e);
      }
    } catch (e) {
      console.warn("[CEG] init:", e.message);
    }
    return this;
  }

  _save() {
    try {
      fs.writeFileSync(this._filePath, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        genome : [...this._genome.values()].slice(-100),
      }, null, 2), "utf8");
    } catch (e) {
      console.warn("[CEG] save:", e.message);
    }
  }

  /**
   * Tüm AEP verilerinden otomatik genome üret.
   * @param {object} opts
   * @param {string} opts.version
   * @param {object} opts.scorecard  — EngineeringScorecard.latest()
   * @param {object} opts.backlog    — EngineeringBacklog.summary()
   * @param {object} opts.learning   — LearningDatabase.summary()
   * @param {object} opts.evolution  — EvolutionReport
   * @returns {object} genome entry
   */
  generate({ version, scorecard, backlog, learning, evolution } = {}) {
    const scores = scorecard?.metrics || {};

    const strengths = this._detectStrengths(scores, backlog, learning);
    const failures  = this._detectFailures(backlog, evolution);
    const techDebt  = this._detectTechDebt(evolution, backlog);
    const topImprovement = this._pickTopImprovement(backlog);
    const autoPRReady = (backlog?.open || 0) > 0 && (scores.testCoverage || 0) >= 40;

    const entry = createGenomeEntry({
      module  : "codega-ai",
      version : version || "unknown",
      strengths,
      failures,
      techDebt,
      topImprovement,
      autoPRReady,
      scores,
      backlogSummary : backlog,
      learningSummary: learning,
    });

    this._genome.set(entry.id, entry);
    this._save();
    return entry;
  }

  _detectStrengths(scores, backlog, learning) {
    const strengths = [];
    if ((scores.architecture  || 0) >= 70) strengths.push("Güçlü mimari yapı");
    if ((scores.testCoverage  || 0) >= 60) strengths.push("Yeterli test kapsaması");
    if ((scores.security      || 0) >= 70) strengths.push("Güvenlik skoru yüksek");
    if ((scores.reliability   || 0) >= 70) strengths.push("Güvenilir çalışma");
    if ((learning?.successRate || 0) >= 70) strengths.push("Yüksek patch başarı oranı");
    if ((backlog?.critical     || 0) === 0) strengths.push("Kritik bug yok");
    if (strengths.length === 0) strengths.push("Geliştirme aktif devam ediyor");
    return strengths;
  }

  _detectFailures(backlog, evolution) {
    const failures = [];
    if ((backlog?.critical || 0) > 0)
      failures.push(`${backlog.critical} kritik bug açık`);
    if ((backlog?.bySeverity?.high || 0) >= 3)
      failures.push(`${backlog.bySeverity.high} yüksek öncelikli sorun bekliyor`);
    if ((evolution?.scores?.testCoverage || 0) < 40)
      failures.push("Test kapsaması yetersiz (<%40)");
    if ((evolution?.scores?.architecture || 0) < 50)
      failures.push("Mimari skor düşük");
    if ((evolution?.technicalDebt || []).length > 5)
      failures.push(`${evolution.technicalDebt.length} teknik borç tespiti`);
    return failures;
  }

  _detectTechDebt(evolution, backlog) {
    const debts = [];
    for (const item of (evolution?.technicalDebt || []).slice(0, 5)) {
      debts.push(item.description || item.file || String(item));
    }
    const debtTasks = (backlog?.byCategory?.tech_debt || 0);
    if (debtTasks > 0) debts.push(`${debtTasks} teknik borç görevi backlog'da bekliyor`);
    if (!debts.length) debts.push("Belirgin teknik borç tespit edilmedi");
    return debts;
  }

  _pickTopImprovement(backlog) {
    const top = backlog?.topTasks?.[0];
    if (!top) return "Analiz için daha fazla veri toplanmalı";
    return `[${top.id}] ${top.title} (öncelik: ${top.priority}, önem: ${top.severity})`;
  }

  latest(module = "codega-ai") {
    const entries = [...this._genome.values()].filter(e => e.module === module);
    return entries[entries.length - 1] || null;
  }

  history(module = "codega-ai", n = 5) {
    return [...this._genome.values()]
      .filter(e => e.module === module)
      .slice(-n)
      .reverse();
  }

  /** 5 CEG sorusu + yanıtları formatla */
  report(module = "codega-ai") {
    const entry = this.latest(module);
    if (!entry) return { error: "Henüz genome oluşturulmadı. Analiz çalıştırın." };

    const lines = [`# CODEGA Engineering Genome — ${entry.version}`, ""];
    for (const q of CEG_QUESTIONS) {
      lines.push(`## ${q.text}`);
      const answer = entry.answers[`${q.id}_${q.key}`];
      if (Array.isArray(answer)) {
        for (const a of answer) lines.push(`- ${a}`);
      } else {
        lines.push(String(answer ?? "_Veri yok_"));
      }
      lines.push("");
    }
    lines.push(`**Sağlık Skoru:** ${entry.healthScore}/100 (${entry.healthGrade})`);
    lines.push(`**Evrim Yönü:** ${entry.evolutionVector.direction} — ${entry.evolutionVector.focus}`);
    return { text: lines.join("\n"), entry };
  }

  summary() {
    const latest = this.latest();
    if (!latest) return { hasGenome: false };
    return {
      hasGenome      : true,
      version        : latest.version,
      healthScore    : latest.healthScore,
      healthGrade    : latest.healthGrade,
      evolutionVector: latest.evolutionVector,
      autoPRReady    : latest.answers.q5_autoPRReady,
      strengths      : latest.answers.q1_strengths,
      failures       : latest.answers.q2_failures,
    };
  }
}

module.exports = { CODEGAEG, createGenomeEntry, CEG_QUESTIONS, calcHealthScore, calcEvolutionVector };
