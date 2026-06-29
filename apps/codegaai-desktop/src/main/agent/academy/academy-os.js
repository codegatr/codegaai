"use strict";

/**
 * academy-os.js — CODEGA AI Academy Orkestratoru
 *
 * Sistemin kendini surekli egittigi kalici muhendislik egitim alt sistemi.
 * - Ders calisma, sinav, sertifika, karne (report card), oz-yansima (reflection)
 * - Gecilen her dersin brainRule'lari kalici EngineeringBrain'e PROMOTE edilir
 *   (EngineeringBrain canli chat prompt'una baglidir → ders -> gelecekteki cevaplar)
 * - Ayni hata iki kez olursa otomatik retraining dersi olusur
 *
 * Persistans (dataDir altinda):
 *   transcript.json          — ilerleme, sertifikalar, maturity skoru
 *   learning-history.jsonl   — tum egitim olaylari (append-only)
 *   report-cards.jsonl       — sinav karneleri
 *   reflections.jsonl        — oz-yansimalar
 */

const fs   = require("node:fs");
const path = require("node:path");

const { CURRICULUM, LEVEL_TITLES, lessonsForLevel, getLesson } = require("./curriculum");

class AcademyOS {
  /**
   * @param {object} opts
   * @param {string} opts.dataDir
   * @param {object} [opts.engineeringBrain] — ACE EngineeringBrain instance; varsa brainRule'lar buraya promote edilir
   */
  constructor({ dataDir, engineeringBrain = null } = {}) {
    this._dataDir = dataDir;
    this._brain   = engineeringBrain;
    this._transcriptPath = path.join(dataDir, "transcript.json");
    this._historyPath    = path.join(dataDir, "learning-history.jsonl");
    this._reportPath     = path.join(dataDir, "report-cards.jsonl");
    this._reflectPath    = path.join(dataDir, "reflections.jsonl");

    this._transcript = {
      enrolledAt: Date.now(),
      lessonsStudied: [],     // lessonId[]
      examsPassed: [],        // lessonId[]
      examsFailed: [],        // { lessonId, score, at }[]
      certifications: [],     // { lessonId, title, level, score, at }[]
      retrainings: [],        // { lessonId, reason, at }[]
      promotedRules: [],      // brainRule.title[]
      currentLevel: 1,
      maturityScore: 0,
    };
  }

  init() {
    try {
      fs.mkdirSync(this._dataDir, { recursive: true });
      if (fs.existsSync(this._transcriptPath)) {
        const raw = JSON.parse(fs.readFileSync(this._transcriptPath, "utf8"));
        this._transcript = { ...this._transcript, ...raw };
      }
    } catch (e) {
      console.warn("[Academy] init:", e.message);
    }
    return this;
  }

  /** EngineeringBrain'i sonradan bagla (ACE async init sonrasi). */
  setEngineeringBrain(brain) { this._brain = brain || this._brain; return this; }

  // ── Persistans yardimcilari ─────────────────────────────────────────────────

  _saveTranscript() {
    try {
      fs.writeFileSync(this._transcriptPath, JSON.stringify(this._transcript, null, 2), "utf8");
    } catch (e) { console.warn("[Academy] saveTranscript:", e.message); }
  }

  _append(file, record) {
    try {
      fs.mkdirSync(this._dataDir, { recursive: true });
      fs.appendFileSync(file, JSON.stringify({ ...record, _at: Date.now() }) + "\n", "utf8");
    } catch (e) { console.warn("[Academy] append:", e.message); }
  }

  // ── Mufredat ────────────────────────────────────────────────────────────────

  curriculum()            { return CURRICULUM; }
  lessonsForLevel(level)  { return lessonsForLevel(level); }
  getLesson(id)           { return getLesson(id); }

  // ── Ders calisma ────────────────────────────────────────────────────────────

  /**
   * Bir dersi calis (teoriyi gormus say). ONERILIR ama sinav icin ZORUNLU DEGIL:
   * challenge exam'a izin verilir. Calismadan gecilen sinav sertifikada
   * studiedFirst=false olarak isaretlenir.
   */
  studyLesson(lessonId) {
    const lesson = getLesson(lessonId);
    if (!lesson) throw new Error(`Ders bulunamadi: ${lessonId}`);
    if (!this._transcript.lessonsStudied.includes(lessonId)) {
      this._transcript.lessonsStudied.push(lessonId);
      this._saveTranscript();
    }
    this._append(this._historyPath, { event: "study", lessonId, title: lesson.title });
    return lesson;
  }

  // ── Sinav ───────────────────────────────────────────────────────────────────

  /**
   * Bir dersin sinavini cevapla.
   * @param {string} lessonId
   * @param {number[]} answers — her soru icin secilen secenek index'i
   * @returns {{ passed, score, correct, total, certification, reflection }}
   */
  takeExam(lessonId, answers = []) {
    const lesson = getLesson(lessonId);
    if (!lesson) throw new Error(`Ders bulunamadi: ${lessonId}`);

    const questions = lesson.exam?.questions || [];
    if (!questions.length) {
      // Sinav sorusu olmayan (stub) dersler: calisilmissa "tamamlandi" say, sertifika verme
      return { passed: false, score: 0, correct: 0, total: 0, certification: null, reflection: null, stub: true };
    }

    let correct = 0;
    questions.forEach((qq, i) => { if (Number(answers[i]) === qq.correctIndex) correct++; });
    const score  = Math.round((correct / questions.length) * 100);
    const passScore = lesson.exam.passScore || 70;
    const passed = score >= passScore;

    this._append(this._historyPath, { event: "exam", lessonId, score, passed });

    if (passed) {
      return { passed, score, correct, total: questions.length, ...this._onExamPassed(lesson, score) };
    }
    return { passed, score, correct, total: questions.length, certification: null,
             reflection: null, ...this._onExamFailed(lesson, score) };
  }

  _onExamPassed(lesson, score) {
    // Sertifika
    if (!this._transcript.examsPassed.includes(lesson.id)) {
      this._transcript.examsPassed.push(lesson.id);
    }

    // Ders calisilmadan gecildiyse "challenge exam" olarak isaretle (seffaflik).
    const studiedFirst = this._transcript.lessonsStudied.includes(lesson.id);

    // Ders basina TEK sertifika: retake'te yeni kayit ekleme, mevcudu guncelle.
    let cert = this._transcript.certifications.find((c) => c.lessonId === lesson.id);
    if (cert) {
      cert.score = Math.max(cert.score, score);
      cert.retakeCount = (cert.retakeCount || 0) + 1;
      cert.studiedFirst = cert.studiedFirst || studiedFirst;
      cert.at = Date.now();
    } else {
      cert = { lessonId: lesson.id, title: lesson.title, level: lesson.level,
               score, retakeCount: 0, studiedFirst, at: Date.now() };
      this._transcript.certifications.push(cert);
    }

    // brainRule'lari kalici bilgiye PROMOTE et
    const promoted = this._promoteBrainRules(lesson);

    // Oz-yansima
    const reflection = this._reflect(lesson, { passed: true, score });

    this._recomputeMaturity();
    this._saveTranscript();

    return { certification: cert, promotedRules: promoted, reflection };
  }

  _onExamFailed(lesson, score) {
    this._transcript.examsFailed.push({ lessonId: lesson.id, score, at: Date.now() });

    // Ayni ders ikinci kez basarisizsa otomatik retraining
    const failCount = this._transcript.examsFailed.filter((f) => f.lessonId === lesson.id).length;
    let retraining = null;
    if (failCount >= 2) {
      retraining = { lessonId: lesson.id, reason: `${failCount} kez basarisiz — retraining gerekli`, at: Date.now() };
      this._transcript.retrainings.push(retraining);
      this._append(this._historyPath, { event: "retraining", lessonId: lesson.id, failCount });
    }

    const reflection = this._reflect(lesson, { passed: false, score });
    this._saveTranscript();
    return { retraining, reflection };
  }

  // ── Engineering Brain promote ───────────────────────────────────────────────

  _promoteBrainRules(lesson) {
    const promoted = [];
    for (const rule of (lesson.brainRules || [])) {
      promoted.push(rule.title);
      if (!this._transcript.promotedRules.includes(rule.title)) {
        this._transcript.promotedRules.push(rule.title);
      }
      // Gercek EngineeringBrain varsa kalici bilgiye yaz (canli prompt'a akar)
      if (this._brain && typeof this._brain.learn === "function") {
        try {
          this._brain.learn({
            type: rule.type, title: rule.title, description: rule.description,
            tags: rule.tags || [], confidence: rule.confidence || 0.85,
            source: `academy:${lesson.id}`,
          });
        } catch (e) { console.warn("[Academy] promote:", e.message); }
      }
      this._append(this._historyPath, { event: "promote-rule", lessonId: lesson.id, rule: rule.title });
    }
    return promoted;
  }

  // ── Oz-yansima ──────────────────────────────────────────────────────────────

  _reflect(lesson, { passed, score }) {
    const reflection = {
      lessonId: lesson.id,
      title: lesson.title,
      passed, score,
      learned: lesson.goal,
      previousMistake: (lesson.commonMistakes || [])[0] || null,
      behaviorChange: passed
        ? `Bundan sonra: ${(lesson.rules?.do || [])[0] || lesson.title}`
        : `Tekrar calisilacak: ${lesson.title}`,
      principleShift: (lesson.brainRules || [])[0]?.title || null,
      at: Date.now(),
    };
    this._append(this._reflectPath, reflection);
    return reflection;
  }

  // ── Karne (Report Card) ─────────────────────────────────────────────────────

  /** Cok eksenli karne uret. */
  reportCard() {
    const t = this._transcript;
    const totalLessons = CURRICULUM.length;
    const passed = t.examsPassed.length;
    const failedUnique = new Set(t.examsFailed.map((f) => f.lessonId)).size;

    const knowledge   = pct(t.lessonsStudied.length, totalLessons);
    const engineering = pct(passed, totalLessons);
    const architecture = pct(this._passedAtLevel(3) + this._passedAtLevel(4), this._countAtLevel(3) + this._countAtLevel(4));
    const reasoning   = clamp(100 - failedUnique * 5);
    const codeQuality = pct(t.promotedRules.length, ruleCount());
    const riskAware   = pct(this._passedAtLevel(5), this._countAtLevel(5));
    const contextAware = pct(this._passedAtLevel(7), this._countAtLevel(7));
    const missionAware = pct(this._passedAtLevel(8), this._countAtLevel(8));

    const overall = Math.round(
      (knowledge + engineering + architecture + reasoning + codeQuality + riskAware + contextAware + missionAware) / 8
    );

    const card = {
      knowledgeScore: knowledge,
      architectureScore: architecture,
      reasoningScore: reasoning,
      engineeringScore: engineering,
      codeQualityScore: codeQuality,
      riskAwarenessScore: riskAware,
      contextAwarenessScore: contextAware,
      missionAwarenessScore: missionAware,
      overallGrade: letterGrade(overall),
      overallScore: overall,
      maturityScore: t.maturityScore,
      at: Date.now(),
    };
    this._append(this._reportPath, card);
    return card;
  }

  _passedAtLevel(level) {
    const ids = new Set(lessonsForLevel(level).map((l) => l.id));
    return this._transcript.examsPassed.filter((id) => ids.has(id)).length;
  }
  _countAtLevel(level) { return lessonsForLevel(level).length; }

  _recomputeMaturity() {
    // Maturity = gecilen ders orani * 100, ust seviyeler agirlikli
    let weighted = 0, maxWeighted = 0;
    for (const lesson of CURRICULUM) {
      const w = lesson.level; // ust seviye daha agir
      maxWeighted += w;
      if (this._transcript.examsPassed.includes(lesson.id)) weighted += w;
    }
    this._transcript.maturityScore = maxWeighted ? Math.round((weighted / maxWeighted) * 1000) / 10 : 0;
    // Mevcut seviye: tamamlanan en yuksek seviye + 1
    let lvl = 1;
    for (let L = 1; L <= 8; L++) {
      if (this._passedAtLevel(L) >= this._countAtLevel(L) && this._countAtLevel(L) > 0) lvl = Math.min(8, L + 1);
    }
    this._transcript.currentLevel = lvl;
  }

  // ── Transkript / ozet ───────────────────────────────────────────────────────

  transcript() { return { ...this._transcript, currentLevelTitle: LEVEL_TITLES[this._transcript.currentLevel] }; }

  summary() {
    const t = this._transcript;
    return {
      currentLevel: t.currentLevel,
      currentLevelTitle: LEVEL_TITLES[t.currentLevel],
      lessonsStudied: t.lessonsStudied.length,
      examsPassed: t.examsPassed.length,
      certifications: t.certifications.length,
      promotedRules: t.promotedRules.length,
      retrainings: t.retrainings.length,
      maturityScore: t.maturityScore,
      totalLessons: CURRICULUM.length,
    };
  }

  /** Kalici ogrenilmis muhendislik kurallari (promote edilenler) */
  engineeringKnowledge() {
    return this._transcript.promotedRules.slice();
  }
}

// ── Saf yardimcilar ──────────────────────────────────────────────────────────

function pct(n, d)        { return d > 0 ? Math.round((n / d) * 100) : 0; }
function clamp(n)         { return Math.max(0, Math.min(100, Math.round(n))); }
function ruleCount()      { return CURRICULUM.reduce((s, l) => s + (l.brainRules?.length || 0), 0); }
function letterGrade(s) {
  if (s >= 90) return "A";
  if (s >= 80) return "B";
  if (s >= 70) return "C";
  if (s >= 60) return "D";
  return "F";
}

module.exports = { AcademyOS };
