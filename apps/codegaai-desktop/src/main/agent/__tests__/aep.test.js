"use strict";

const os   = require("node:os");
const path = require("node:path");
const fs   = require("node:fs");

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "aep-test-"));

// ── engineering-backlog ───────────────────────────────────────────────────────
const { EngineeringBacklog, createTask, calcPriority, SEVERITY, CATEGORY, TASK_STATUS, EFFORT } =
  require("../aep/engineering-backlog");

describe("EngineeringBacklog", () => {
  let backlog, dir;
  beforeEach(() => { dir = tmpDir(); backlog = new EngineeringBacklog(dir).init(); });

  it("task oluşturur ve ekler", () => {
    const t = backlog.add({ title: "Test bug", severity: SEVERITY.HIGH, category: CATEGORY.BUG });
    expect(t.id).toMatch(/^ET-/);
    expect(t.severity).toBe(SEVERITY.HIGH);
    expect(t.status).toBe(TASK_STATUS.OPEN);
  });

  it("duplikat title'lı task eklenmez", () => {
    backlog.add({ title: "Dup bug" });
    const t2 = backlog.add({ title: "Dup bug" });
    expect(backlog.count()).toBe(1);
    expect(t2.id).toBeTruthy();
  });

  it("öncelik yüksek severity ile artar", () => {
    const critical = createTask({ title: "x", severity: SEVERITY.CRITICAL, effort: EFFORT.XS });
    const low      = createTask({ title: "y", severity: SEVERITY.LOW,      effort: EFFORT.XS });
    expect(calcPriority(critical)).toBeGreaterThan(calcPriority(low));
  });

  it("task güncellenir", () => {
    const t = backlog.add({ title: "Update me" });
    const updated = backlog.update(t.id, { status: TASK_STATUS.IN_PROGRESS });
    expect(updated.status).toBe(TASK_STATUS.IN_PROGRESS);
  });

  it("addFromAnalysis toplu ekler", () => {
    const added = backlog.addFromAnalysis([
      { title: "A1", category: CATEGORY.BUG, severity: SEVERITY.HIGH },
      { title: "A2", category: CATEGORY.PERFORMANCE },
    ]);
    expect(added.length).toBe(2);
    expect(backlog.count()).toBe(2);
  });

  it("summary doğru hesaplar", () => {
    backlog.add({ title: "B1", severity: SEVERITY.CRITICAL });
    backlog.add({ title: "B2", severity: SEVERITY.LOW });
    const s = backlog.summary();
    expect(s.total).toBe(2);
    expect(s.critical).toBe(1);
    expect(s.open).toBe(2);
  });

  it("disk'e kaydedip yeniden yükler", () => {
    backlog.add({ title: "Persist me" });
    const backlog2 = new EngineeringBacklog(dir).init();
    expect(backlog2.count()).toBe(1);
  });
});

// ── improvement-planner ───────────────────────────────────────────────────────
const { ImprovementPlanner, generateProposalsForTask, PROPOSAL_TYPE, PROPOSAL_STATUS, calcROI } =
  require("../aep/improvement-planner");

describe("ImprovementPlanner", () => {
  let planner, dir;
  beforeEach(() => { dir = tmpDir(); planner = new ImprovementPlanner(dir).init(); });

  it("bug task'ı için BUG_FIX önerisi üretir", () => {
    const task = createTask({ title: "Crash on start", category: CATEGORY.BUG, severity: SEVERITY.HIGH });
    const proposals = generateProposalsForTask(task);
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals[0].type).toBe(PROPOSAL_TYPE.BUG_FIX);
  });

  it("ROI hesaplanır", () => {
    const roi = calcROI(8, EFFORT.S, 3);
    expect(roi).toBeGreaterThan(0);
  });

  it("planForTasks öneri üretir", () => {
    const task = createTask({ title: "Tech debt", category: CATEGORY.TECH_DEBT });
    task.id = "ET-TEST01";
    const proposals = planner.planForTasks([task]);
    expect(proposals.length).toBeGreaterThan(0);
  });

  it("aynı task için tekrar öneri üretmez", () => {
    const task = createTask({ title: "No dup" });
    task.id = "ET-NODUP";
    planner.planForTasks([task]);
    const second = planner.planForTasks([task]);
    expect(second.length).toBe(0);
  });

  it("approve / reject çalışır", () => {
    const task = createTask({ title: "Approvable" });
    task.id = "ET-APPR";
    const [p] = planner.planForTasks([task]);
    const approved = planner.approve(p.id);
    expect(approved.status).toBe(PROPOSAL_STATUS.APPROVED);
    const rejected = planner.reject(p.id, "test reason");
    expect(rejected.status).toBe(PROPOSAL_STATUS.REJECTED);
  });
});

// ── engineering-score ─────────────────────────────────────────────────────────
const { EngineeringScorecard, createScorecard, calcDelta, calcGrade } =
  require("../aep/engineering-score");

describe("EngineeringScorecard", () => {
  let scorecard, dir;
  beforeEach(() => { dir = tmpDir(); scorecard = new EngineeringScorecard(dir).init(); });

  it("skorkart oluşturur", () => {
    const s = createScorecard({ version: "1.0.0", metrics: { architecture: 80, testCoverage: 60 } });
    expect(s.version).toBe("1.0.0");
    expect(s.overall).toBeGreaterThan(0);
    expect(s.grade).toBeTruthy();
  });

  it("grade A+ for 90+", () => {
    expect(calcGrade(92)).toBe("A+");
    expect(calcGrade(75)).toBe("B");
    expect(calcGrade(45)).toBe("F");
  });

  it("record ve latest çalışır", () => {
    scorecard.record({ version: "v1", metrics: { architecture: 70 } });
    scorecard.record({ version: "v2", metrics: { architecture: 80 } });
    expect(scorecard.latest().version).toBe("v2");
  });

  it("delta hesaplar", () => {
    scorecard.record({ version: "v1", metrics: { architecture: 50 } });
    scorecard.record({ version: "v2", metrics: { architecture: 70 } });
    const d = scorecard.delta();
    expect(d.improved).toContain("architecture");
  });

  it("DNA kuralı: en az 1 iyileşme", () => {
    scorecard.record({ version: "v1", metrics: { architecture: 50 } });
    scorecard.record({ version: "v2", metrics: { architecture: 70 } });
    expect(scorecard.releasePassesDNARule()).toBe(true);
  });
});

// ── learning-db ───────────────────────────────────────────────────────────────
const { LearningDatabase, LEARNING_TYPE, CONFIDENCE } = require("../aep/learning-db");

describe("LearningDatabase", () => {
  let db, dir;
  beforeEach(() => { dir = tmpDir(); db = new LearningDatabase(dir).init(); });

  it("entry ekler", () => {
    const e = db.add({ type: LEARNING_TYPE.BUG_FIX, title: "Fixed memory leak", lesson: "Use WeakMap" });
    expect(e.id).toMatch(/^LE-/);
  });

  it("type bazlı sorgular", () => {
    db.add({ type: LEARNING_TYPE.BUG_FIX, title: "A" });
    db.add({ type: LEARNING_TYPE.FAILED_PATCH, title: "B" });
    const bugs = db.query({ type: LEARNING_TYPE.BUG_FIX });
    expect(bugs.length).toBe(1);
  });

  it("summary hesaplar", () => {
    db.add({ type: LEARNING_TYPE.SUCCESSFUL_PATCH, title: "OK" });
    db.add({ type: LEARNING_TYPE.FAILED_PATCH, title: "Fail" });
    const s = db.summary();
    expect(s.total).toBe(2);
    expect(s.successRate).toBe(50);
  });
});

// ── competitive-intel ─────────────────────────────────────────────────────────
const { CompetitiveIntel, COMPETITORS } = require("../aep/competitive-intel");

describe("CompetitiveIntel", () => {
  let intel, dir;
  beforeEach(() => { dir = tmpDir(); intel = new CompetitiveIntel(dir).init(); });

  it("5 rakip tanımlanmış", () => {
    expect(Object.keys(COMPETITORS).length).toBeGreaterThanOrEqual(5);
  });

  it("analiz çalışır", () => {
    const analysis = intel.analyze();
    expect(analysis.id).toMatch(/^CI-/);
    expect(analysis.advantages.length).toBeGreaterThan(0);
    expect(analysis.differentiator).toBeTruthy();
  });

  it("roadmap önerisi üretir", () => {
    const analysis = intel.analyze();
    expect(analysis.roadmapSuggestions.length).toBeGreaterThan(0);
  });
});

// ── ceg ───────────────────────────────────────────────────────────────────────
const { CODEGAEG, CEG_QUESTIONS, calcEvolutionVector } = require("../aep/ceg");

describe("CODEGA Engineering Genome (CEG)", () => {
  let genome, dir;
  beforeEach(() => { dir = tmpDir(); genome = new CODEGAEG(dir).init(); });

  it("5 CEG sorusu tanımlanmış", () => {
    expect(CEG_QUESTIONS.length).toBe(5);
  });

  it("evrim vektörü hesaplar", () => {
    const v1 = calcEvolutionVector({ strengths: [], failures: ["a","b","c"], techDebt: [] });
    expect(v1.direction).toBe("repair");
    const v2 = calcEvolutionVector({ strengths: ["a","b"], failures: [], techDebt: [] });
    expect(v2.direction).toBe("forward");
  });

  it("genome üretir", () => {
    const entry = genome.generate({
      version  : "6.0.0-alpha.25",
      scorecard: { metrics: { architecture: 70, testCoverage: 50 } },
      backlog  : { open: 2, critical: 0, topTasks: [] },
      learning : { successRate: 80 },
      evolution: null,
    });
    expect(entry.id).toBe("CEG-codega-ai-6.0.0-alpha.25");
    expect(entry.healthScore).toBeGreaterThan(0);
  });

  it("report 5 soruyu içerir", () => {
    genome.generate({ version: "test-v", scorecard: null, backlog: null, learning: null, evolution: null });
    const report = genome.report();
    expect(report.text).toContain("Neyi iyi yapıyorum");
    expect(report.text).toContain("Nerede başarısız");
  });
});
