"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { AEPOS } = require("../aep/aep-os");

// Deep Audit kanıtı: Evolution analizinden gelen zayıflıklar GERÇEK engineering
// backlog görevine ve timeline olayına dönüşüyor mu? (orphan değil, çalışıyor)
describe("AEP cycle integration (evolution → backlog → timeline)", () => {
  let dir, aep;
  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "codega-aep-"));
    aep = new AEPOS();
    await aep.init({ dataDir: dir, projectRoot: dir, generateFn: async () => "", githubConfig: {} });
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test("init sonrası tüm modüller + timeline hazır", () => {
    expect(aep.isInitialized()).toBe(true);
    expect(aep.backlog).toBeTruthy();
    expect(aep.timeline).toBeTruthy();
    expect(typeof aep.runCycle).toBe("function");
  });

  test("zayıflık raporu → gerçek backlog görevleri üretir", async () => {
    const evolutionReport = {
      scores: { testCoverage: 20, architecture: 40 }, // düşük → görev açmalı
      technicalDebt: [{ description: "TODO temizliği", file: "x.js", severity: "high" }],
    };
    const before = aep.backlog.openTasks().length;
    const result = await aep.runCycle(evolutionReport, "6.0.0-test");
    expect(result.tasksAdded).toBeGreaterThan(0);
    expect(aep.backlog.openTasks().length).toBeGreaterThan(before);
  });

  test("dashboard timeline'ı içerir", () => {
    aep.timeline.add({ type: "release", title: "test sürüm", version: "v1" });
    const d = aep.dashboard();
    expect(d.timeline).toBeTruthy();
    expect(d.timeline.total).toBeGreaterThanOrEqual(1);
  });
});
