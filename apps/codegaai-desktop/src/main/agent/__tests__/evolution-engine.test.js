"use strict";

/**
 * evolution-engine.test.js — Evolution Engine + CODEGA DNA Testleri
 *
 * Sprint 11: Evolution Engine
 */

const path = require("node:path");
const os   = require("node:os");
const fsp  = require("node:fs/promises");

const { EvolutionEngine }         = require("../evolution/evolution-engine");
const { CodegaDNA, DNA_QUESTIONS } = require("../evolution/codega-dna");
const { SPRINT_TYPE, DNA_VERDICT } = require("../mission/mission-types");

// ── Yardımcılar ───────────────────────────────────────────────────────────────

async function makeTmpDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), "codega-evo-test-"));
}

/** Sahte mini proje dizini oluştur */
async function makeMiniFakeProject(dir) {
  const agentDir  = path.join(dir, "src", "main", "agent");
  const testDir   = path.join(agentDir, "__tests__");
  const mainFile  = path.join(dir, "src", "main", "main.js");
  const pkgFile   = path.join(dir, "package.json");

  await fsp.mkdir(agentDir,  { recursive: true });
  await fsp.mkdir(testDir,   { recursive: true });

  // kaynak dosyaları
  await fsp.writeFile(path.join(agentDir, "agent-a.js"), "// agent\n".repeat(300), "utf8");
  await fsp.writeFile(path.join(agentDir, "agent-b.js"), "// agent\n".repeat(150), "utf8");
  // büyük dosya — borç sinyali
  await fsp.writeFile(path.join(agentDir, "agent-huge.js"), "// huge\n".repeat(1100), "utf8");
  // test dosyası
  await fsp.writeFile(path.join(testDir, "agent-a.test.js"), "// test\n".repeat(50), "utf8");
  // main.js
  await fsp.writeFile(mainFile, Array.from({ length: 900 }, (_, i) =>
    i % 30 === 0 ? "ipcMain.handle(" : "// code"
  ).join("\n"), "utf8");
  // package.json
  await fsp.writeFile(pkgFile, JSON.stringify({
    version: "6.0.0-alpha.24",
    dependencies: { electron: "^30.0.0", lodash: "^4.17.21" },
    devDependencies: { jest: "^29.0.0" },
  }), "utf8");

  return dir;
}

// ── EvolutionEngine ───────────────────────────────────────────────────────────

describe("EvolutionEngine", () => {
  let projDir, dataDir, engine;

  beforeEach(async () => {
    projDir = await makeTmpDir();
    dataDir = await makeTmpDir();
    await makeMiniFakeProject(projDir);
    engine = new EvolutionEngine(projDir, dataDir);
    await engine.init();
  });

  afterEach(async () => {
    await fsp.rm(projDir, { recursive: true, force: true });
    await fsp.rm(dataDir, { recursive: true, force: true });
  });

  test("analyze() rapor üretir", async () => {
    const report = await engine.analyze();
    expect(report.id).toMatch(/^evo_/);
    expect(report.scores).toBeDefined();
    expect(report.scores.architecture).toBeGreaterThanOrEqual(0);
    expect(report.scores.architecture).toBeLessThanOrEqual(100);
    expect(report.version).toBe("6.0.0-alpha.24");
  }, 20000);

  test("Büyük dosya teknik borç olarak işaretlenir", async () => {
    const report = await engine.analyze();
    const hasHuge = report.technicalDebt.some(d =>
      d.type === "huge-file" || d.type === "large-file"
    );
    expect(hasHuge).toBe(true);
  }, 20000);

  test("Test dosyaları ve oranı hesaplanır", async () => {
    const report = await engine.analyze();
    expect(report.modules.test.testFiles).toBeGreaterThanOrEqual(1);
    expect(report.modules.test.ratio).toBeGreaterThan(0);
  }, 20000);

  test("IPC handler sayısı tespit edilir", async () => {
    const report = await engine.analyze();
    expect(report.modules.ipc.handlers).toBeGreaterThan(0);
  }, 20000);

  test("İyileştirme önerileri üretilir", async () => {
    const report = await engine.analyze();
    expect(Array.isArray(report.improvements)).toBe(true);
    expect(Array.isArray(report.engineeringTodos)).toBe(true);
  }, 20000);

  test("Rapor diske kaydedilir", async () => {
    await engine.analyze();
    const reports = await engine.loadReports();
    expect(reports.length).toBe(1);
    expect(reports[0].id).toMatch(/^evo_/);
  }, 20000);

  test("Birden fazla rapor saklanır", async () => {
    await engine.analyze();
    await engine.analyze();
    const reports = await engine.loadReports();
    expect(reports.length).toBe(2);
  }, 30000);
});

// ── CodegaDNA ────────────────────────────────────────────────────────────────

describe("CodegaDNA", () => {
  let dir, dna;

  beforeEach(async () => {
    dir = await makeTmpDir();
    dna = new CodegaDNA(dir);
    await dna.init();
  });

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  test("DNA soruları doğru şekilde tanımlı", () => {
    expect(DNA_QUESTIONS).toHaveLength(5);
    const keys = DNA_QUESTIONS.map(q => q.key);
    expect(keys).toContain("q1");
    expect(keys).toContain("q5");
    const q5 = DNA_QUESTIONS.find(q => q.key === "q5");
    expect(q5.inverted).toBe(true);
    expect(q5.critical).toBe(true);
  });

  test("Değerlendirme kaydı oluşturulur", async () => {
    const record = await dna.evaluate({
      version:   "6.0.0-alpha.24",
      scores:    { q1: 4, q2: 3, q3: 5, q4: 4, q5: 1 },
      reasoning: "Önemli altyapı geliştirmesi",
      sprintType: SPRINT_TYPE.FOUNDATION,
    });
    expect(record.id).toMatch(/^dna_/);
    expect(record.version).toBe("6.0.0-alpha.24");
    expect(record.total).toBe(17); // 4+3+5+4+1
    expect(record.verdict).toBe(DNA_VERDICT.MARGINAL); // 17 = marginal
  });

  test("Yüksek skorlu sprint SUCCESSFUL olur", async () => {
    const record = await dna.evaluate({
      version: "6.0.0-alpha.25",
      scores:  { q1: 5, q2: 4, q3: 5, q4: 5, q5: 1 }, // 20 puan
    });
    expect(record.verdict).toBe(DNA_VERDICT.SUCCESSFUL);
  });

  test("Q5=5 otomatik FAILED yapar", async () => {
    const record = await dna.evaluate({
      version: "6.0.0-alpha.26",
      scores:  { q1: 5, q2: 5, q3: 5, q4: 5, q5: 5 }, // Q5 yüksek = kötü sprint
    });
    expect(record.verdict).toBe(DNA_VERDICT.FAILED);
  });

  test("Düşük toplam puan FAILED olur", async () => {
    const record = await dna.evaluate({
      version: "6.0.0-alpha.27",
      scores:  { q1: 1, q2: 1, q3: 1, q4: 1, q5: 1 }, // 5 puan
    });
    expect(record.verdict).toBe(DNA_VERDICT.FAILED);
  });

  test("Version ile DNA kaydı bulunur", async () => {
    await dna.evaluate({ version: "6.0.0-alpha.24", scores: { q1: 4, q2: 4, q3: 4, q4: 4, q5: 2 } });
    const found = dna.getByVersion("6.0.0-alpha.24");
    expect(found).not.toBeNull();
    expect(found.version).toBe("6.0.0-alpha.24");
  });

  test("Tüm kayıtlar listelenir", async () => {
    await dna.evaluate({ version: "v1", scores: { q1: 3, q2: 3, q3: 3, q4: 3, q5: 2 } });
    await dna.evaluate({ version: "v2", scores: { q1: 4, q2: 4, q3: 4, q4: 4, q5: 1 } });
    expect(dna.listAll()).toHaveLength(2);
  });

  test("trend() özet istatistik döner", async () => {
    await dna.evaluate({ version: "v1", scores: { q1: 5, q2: 4, q3: 5, q4: 4, q5: 1 } });
    await dna.evaluate({ version: "v2", scores: { q1: 4, q2: 4, q3: 4, q4: 4, q5: 2 } });
    const t = dna.trend();
    expect(t).not.toBeNull();
    expect(t.sprints).toBe(2);
    expect(t.avgScore).toBeGreaterThan(0);
  });

  test("Disk kalıcılığı — yeniden yükle", async () => {
    await dna.evaluate({ version: "persist-v1", scores: { q1: 4, q2: 4, q3: 4, q4: 4, q5: 1 } });
    const dna2 = new CodegaDNA(dir);
    await dna2.init();
    expect(dna2.listAll()).toHaveLength(1);
    expect(dna2.getByVersion("persist-v1")).not.toBeNull();
  });
});
