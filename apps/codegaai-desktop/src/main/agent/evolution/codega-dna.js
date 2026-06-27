"use strict";

/**
 * codega-dna.js — CODEGA AI DNA Değerlendirme Sistemi
 *
 * Sprint 11: Evolution Engine
 *
 * Her release sonrası CODEGA AI kendine 5 soru sorar:
 *
 *   Q1: Bu sürüm beni daha zeki yaptı mı?
 *   Q2: Bu sürüm beni daha hızlı yaptı mı?
 *   Q3: Bu sürüm beni daha güvenilir yaptı mı?
 *   Q4: Bu sürüm kullanıcıya gerçekten zaman kazandırdı mı?
 *   Q5: Bu sürüm olmasaydı ürün yine de aynı kalır mıydı?
 *       (EVET → sprint başarısız, ürüne değer katmadı)
 *
 * Skorlar: 0-5 arası. Toplam 25 puan.
 * Karar: SUCCESSFUL (>=18), MARGINAL (12-17), FAILED (<12 veya Q5=5)
 *
 * DNA kaydı, sürümler arası eğilimi izlemek için kalıcı olarak saklanır.
 */

const path = require("node:path");
const fsp  = require("node:fs/promises");

const { DNA_VERDICT, SPRINT_TYPE } = require("../mission/mission-types");

// ── DNA Soruları ──────────────────────────────────────────────────────────────

const DNA_QUESTIONS = Object.freeze([
  {
    id:       "intelligence",
    key:      "q1",
    question: "Bu sürüm beni daha zeki yaptı mı?",
    hint:     "Yeni reasoning, planlama, bağlam veya anlayış kapasitesi eklendi mi?",
    inverted: false,
  },
  {
    id:       "speed",
    key:      "q2",
    question: "Bu sürüm beni daha hızlı yaptı mı?",
    hint:     "Yanıt süresi, işlem hızı veya kullanıcı akışı iyileşti mi?",
    inverted: false,
  },
  {
    id:       "reliability",
    key:      "q3",
    question: "Bu sürüm beni daha güvenilir yaptı mı?",
    hint:     "Bug düzeltildi mi, hata oranı azaldı mı, test kapsamı arttı mı?",
    inverted: false,
  },
  {
    id:       "userValue",
    key:      "q4",
    question: "Bu sürüm kullanıcıya gerçekten zaman kazandırdı mı?",
    hint:     "Kullanıcı bir görevi daha hızlı veya daha iyi yapabiliyor mu?",
    inverted: false,
  },
  {
    id:       "necessity",
    key:      "q5",
    question: "Bu sürüm olmasaydı ürün yine de aynı kalır mıydı?",
    hint:     "EVET ise sprint başarısız — ürüne değer katmadı. HAYIR ise kritik katkı.",
    inverted: true, // yüksek skor = EVET = kötü (inverted scale)
    critical: true, // necessity=5 → otomatik FAILED
  },
]);

// ── CODEGA DNA Manager ────────────────────────────────────────────────────────

class CodegaDNA {
  /**
   * @param {string} dataDir — kalıcı depolama dizini
   */
  constructor(dataDir) {
    this._file  = dataDir ? path.join(dataDir, "codega-dna.json") : null;
    this._records = []; // { version, missionId, scores, verdict, ... }
    this._ready   = false;
  }

  async init() {
    if (this._ready) return this;
    if (this._file) {
      try {
        const raw   = await fsp.readFile(this._file, "utf8");
        this._records = JSON.parse(raw);
      } catch (e) {
        if (e.code !== "ENOENT") console.warn("[CODEGA DNA]", e.message);
        this._records = [];
      }
    }
    this._ready = true;
    return this;
  }

  // ── Değerlendirme ─────────────────────────────────────────────────────────

  /**
   * Bir release için DNA değerlendirmesi oluşturur.
   *
   * @param {object} opts
   * @param {string}  opts.version      — "6.0.0-alpha.24"
   * @param {string}  [opts.missionId]  — ilgili mission ID
   * @param {object}  opts.scores       — { q1, q2, q3, q4, q5 } her biri 0-5
   * @param {string}  [opts.reasoning]  — serbest metin gerekçe
   * @param {string}  [opts.sprintType] — "foundation"|"capability"
   * @returns {object} DNA kaydı
   */
  async evaluate({
    version,
    missionId  = null,
    scores     = {},
    reasoning  = "",
    sprintType = SPRINT_TYPE.CAPABILITY,
  }) {
    this._assertReady();
    if (!version) throw new Error("CODEGA DNA: version gerekli");

    // Skor normalizasyonu (0-5 arası)
    const normalized = {};
    for (const q of DNA_QUESTIONS) {
      normalized[q.key] = Math.max(0, Math.min(5, Number(scores[q.key]) || 0));
    }

    const total   = Object.values(normalized).reduce((s, v) => s + v, 0);
    const verdict = this._calcVerdict(normalized, total);

    const record = {
      id:         `dna_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      version,
      missionId,
      evaluatedAt: Date.now(),
      sprintType,
      scores:     normalized,
      total,        // out of 25
      verdict,
      reasoning,
      questions:  DNA_QUESTIONS.map(q => ({
        ...q,
        score:  normalized[q.key],
        answer: this._scoreToLabel(normalized[q.key], q.inverted),
      })),
    };

    this._records.push(record);
    await this._save();
    return record;
  }

  /**
   * Otomatik DNA değerlendirmesi — Evolution Engine çıktısından hesaplar.
   * İnsan değerlendirmesi olmadığında kullanılır.
   *
   * @param {string}  version
   * @param {object}  evolutionReport — EvolutionEngine.analyze() çıktısı
   * @param {object}  missionSummary  — MissionOS'tan mission özeti
   * @returns {Promise<object>}
   */
  async autoEvaluate(version, evolutionReport, missionSummary = {}) {
    const s = evolutionReport?.scores || {};

    // Heuristik skor hesabı (0-5)
    const q1 = this._norm5(missionSummary.newCapabilities > 0 ? 4 : 2);
    const q2 = this._norm5(s.overall > 80 ? 4 : s.overall > 60 ? 3 : 2);
    const q3 = this._norm5(s.testCoverage > 70 ? 4 : s.testCoverage > 40 ? 3 : 2);
    const q4 = this._norm5(missionSummary.userFacing !== false ? 4 : 2);
    // Q5: sürüm olmasaydı aynı kalır mıydı? (düşük = iyi)
    const q5 = this._norm5(missionSummary.sprintType === SPRINT_TYPE.FOUNDATION ? 1 : 2);

    return this.evaluate({
      version,
      missionId:  missionSummary.missionId,
      scores:     { q1, q2, q3, q4, q5 },
      reasoning:  `Otomatik değerlendirme — Mimari skoru: ${s.overall || 0}/100`,
      sprintType: missionSummary.sprintType || SPRINT_TYPE.CAPABILITY,
    });
  }

  // ── Sorgular ─────────────────────────────────────────────────────────────

  /** Belirli versiyon için DNA kaydı. */
  getByVersion(version) {
    return this._records.find(r => r.version === version) || null;
  }

  /** Tüm DNA kayıtları (en yenisi başta). */
  listAll() {
    return [...this._records].sort((a, b) => b.evaluatedAt - a.evaluatedAt);
  }

  /** Son N kaydın özet istatistiği. */
  trend(n = 10) {
    const recent = [...this._records].sort((a, b) => b.evaluatedAt - a.evaluatedAt).slice(0, n);
    if (!recent.length) return null;
    const avgTotal  = recent.reduce((s, r) => s + r.total, 0) / recent.length;
    const successes = recent.filter(r => r.verdict === DNA_VERDICT.SUCCESSFUL).length;
    const failures  = recent.filter(r => r.verdict === DNA_VERDICT.FAILED).length;
    return {
      avgScore:   Math.round(avgTotal * 10) / 10,
      maxScore:   25,
      successRate: Math.round((successes / recent.length) * 100),
      failures,
      sprints:    recent.length,
      breakdown:  {
        successful: successes,
        marginal:   recent.filter(r => r.verdict === DNA_VERDICT.MARGINAL).length,
        failed:     failures,
      },
    };
  }

  // ── İç Hesaplamalar ───────────────────────────────────────────────────────

  _calcVerdict(scores, total) {
    // Q5 (necessity) yüksekse — ürün o sürüm olmadan aynı kalırdı → FAILED
    const q5 = scores["q5"] || 0;
    if (q5 >= 5) return DNA_VERDICT.FAILED;
    if (total >= 18) return DNA_VERDICT.SUCCESSFUL;
    if (total >= 12) return DNA_VERDICT.MARGINAL;
    return DNA_VERDICT.FAILED;
  }

  _scoreToLabel(score, inverted) {
    if (inverted) {
      // Q5: yüksek skor = kötü
      if (score <= 1) return "Kesinlikle hayır (kritik katkı)";
      if (score <= 2) return "Hayır (değer katıyor)";
      if (score <= 3) return "Kısmen";
      if (score <= 4) return "Evet (zayıf sprint)";
      return "Kesinlikle evet (sprint başarısız)";
    }
    if (score <= 0) return "Hayır";
    if (score <= 1) return "Çok az";
    if (score <= 2) return "Biraz";
    if (score <= 3) return "Evet";
    if (score <= 4) return "Kesinlikle evet";
    return "Dönüşümsel";
  }

  _norm5(v) { return Math.max(0, Math.min(5, Math.round(v))); }

  async _save() {
    if (!this._file) return;
    await fsp.writeFile(this._file, JSON.stringify(this._records, null, 2), "utf8");
  }

  _assertReady() {
    if (!this._ready) throw new Error("CodegaDNA henüz başlatılmadı — init() çağrılmadı");
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const codegaDNA = new CodegaDNA(null); // dataDir main.js'de set edilir

async function initCodegaDNA(dataDir) {
  codegaDNA._file = path.join(dataDir, "codega-dna.json");
  return codegaDNA.init();
}

module.exports = { CodegaDNA, codegaDNA, initCodegaDNA, DNA_QUESTIONS };
