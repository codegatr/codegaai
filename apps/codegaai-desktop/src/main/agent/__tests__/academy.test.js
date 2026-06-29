"use strict";

/**
 * academy.test.js — CODEGA AI Academy testleri (Phase I)
 */

const path = require("node:path");
const os   = require("node:os");
const fs   = require("node:fs");

const { CURRICULUM, lessonsForLevel, getLesson, LEVEL_TITLES } = require("../academy/curriculum");
const { AcademyOS } = require("../academy/academy-os");

describe("Academy curriculum", () => {
  test("8 seviyenin tamami tanimli ve ders iceriyor", () => {
    for (let level = 1; level <= 8; level++) {
      expect(LEVEL_TITLES[level]).toBeDefined();
      expect(lessonsForLevel(level).length).toBeGreaterThan(0);
    }
  });

  test("her ders zorunlu alanlara sahip", () => {
    for (const lesson of CURRICULUM) {
      expect(lesson.id).toBeTruthy();
      expect(lesson.level).toBeGreaterThanOrEqual(1);
      expect(lesson.title).toBeTruthy();
      expect(lesson.goal).toBeTruthy();
      expect(lesson.exam).toBeDefined();
      expect(Array.isArray(lesson.brainRules)).toBe(true);
    }
  });

  test("ders id'leri benzersiz", () => {
    const ids = CURRICULUM.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("Level 1 dersleri gercek sinav sorusu iceriyor (stub degil)", () => {
    for (const lesson of lessonsForLevel(1)) {
      expect(lesson.exam.questions.length).toBeGreaterThan(0);
      for (const q of lesson.exam.questions) {
        expect(q.options[q.correctIndex]).toBeDefined();
      }
    }
  });
});

describe("AcademyOS", () => {
  let dir, academy, brainLearned;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "academy-"));
    brainLearned = [];
    const fakeBrain = { learn: (rule) => { brainLearned.push(rule); return rule; } };
    academy = new AcademyOS({ dataDir: dir, engineeringBrain: fakeBrain }).init();
  });

  test("studyLesson dersi calisma listesine ekler", () => {
    academy.studyLesson("L1-utf8-integrity");
    expect(academy.transcript().lessonsStudied).toContain("L1-utf8-integrity");
  });

  test("studyLesson bilinmeyen ders icin hata firlatir", () => {
    expect(() => academy.studyLesson("yok-boyle-ders")).toThrow();
  });

  test("dogru cevaplarla sinav gecilir ve sertifika verilir", () => {
    const r = academy.takeExam("L1-utf8-integrity", [1, 1]);
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
    expect(r.certification).toBeTruthy();
    expect(r.certification.title).toContain("UTF-8");
  });

  test("gecilen dersin brainRule'lari EngineeringBrain'e promote edilir", () => {
    academy.takeExam("L1-utf8-integrity", [1, 1]);
    expect(brainLearned.length).toBeGreaterThan(0);
    expect(brainLearned[0].source).toContain("academy:");
    expect(academy.engineeringKnowledge().length).toBeGreaterThan(0);
  });

  test("yanlis cevaplarla sinav gecilemez, sertifika yok", () => {
    const r = academy.takeExam("L1-semver-not-string", [0, 0]);
    expect(r.passed).toBe(false);
    expect(r.certification).toBeFalsy();
  });

  test("ayni ders iki kez basarisizsa retraining olusur", () => {
    academy.takeExam("L1-semver-not-string", [0, 0]);
    const second = academy.takeExam("L1-semver-not-string", [0, 0]);
    expect(second.retraining).toBeTruthy();
    expect(academy.transcript().retrainings.length).toBeGreaterThan(0);
  });

  test("sinav sonrasi oz-yansima uretilir", () => {
    const r = academy.takeExam("L1-utf8-integrity", [1, 1]);
    expect(r.reflection).toBeTruthy();
    expect(r.reflection.behaviorChange).toBeTruthy();
  });

  test("report card cok eksenli skor ve harf notu uretir", () => {
    academy.takeExam("L1-utf8-integrity", [1, 1]);
    const card = academy.reportCard();
    expect(card).toHaveProperty("knowledgeScore");
    expect(card).toHaveProperty("engineeringScore");
    expect(card).toHaveProperty("contextAwarenessScore");
    expect(["A", "B", "C", "D", "F"]).toContain(card.overallGrade);
  });

  test("ders gectikce maturity skoru artar", () => {
    const before = academy.summary().maturityScore;
    academy.takeExam("L1-utf8-integrity", [1, 1]);
    const after = academy.summary().maturityScore;
    expect(after).toBeGreaterThan(before);
  });

  test("transkript diske kalici yazilir ve yeniden yuklenir", () => {
    academy.takeExam("L1-utf8-integrity", [1, 1]);
    const reloaded = new AcademyOS({ dataDir: dir }).init();
    expect(reloaded.transcript().examsPassed).toContain("L1-utf8-integrity");
  });

  test("brain bagli degilken bile sinav gecilir (promote sessizce atlanir)", () => {
    const noBrainDir = fs.mkdtempSync(path.join(os.tmpdir(), "academy-nb-"));
    const a = new AcademyOS({ dataDir: noBrainDir }).init();
    const r = a.takeExam("L1-utf8-integrity", [1, 1]);
    expect(r.passed).toBe(true);
    expect(a.engineeringKnowledge().length).toBeGreaterThan(0);
  });

  test("setEngineeringBrain sonradan baglanabilir", () => {
    const noBrainDir = fs.mkdtempSync(path.join(os.tmpdir(), "academy-late-"));
    const late = [];
    const a = new AcademyOS({ dataDir: noBrainDir }).init();
    a.setEngineeringBrain({ learn: (r) => { late.push(r); return r; } });
    a.takeExam("L1-utf8-integrity", [1, 1]);
    expect(late.length).toBeGreaterThan(0);
  });
});
