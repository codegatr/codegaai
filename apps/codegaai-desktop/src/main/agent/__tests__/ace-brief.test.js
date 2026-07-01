"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ACEOS } = require("../ace/ace-os");

let dir, ace;
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "codega-ace-"));
  ace = new ACEOS(dir);
  await ace.init();
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("ACEOS.buildBrief (bilişsel özet)", () => {
  test("aktif proje + açık iş + bilinen bug özeti üretir, bounded", () => {
    ace.projectBrain.getOrCreate("Ateş Fiat");
    ace.workingMemory.setProject("Ateş Fiat");
    ace.projectBrain.addKnownBug("Ateş Fiat", "UTF-8 bozulması iş emri PDF'inde");
    ace.projectBrain.addOpenTodo("Ateş Fiat", "Install.php sihirbazı ekle");
    ace.projectBrain.addTechnology("Ateş Fiat", "PHP 8.3");

    const brief = ace.buildBrief({ maxChars: 1600 });
    expect(brief).toMatch(/Aktif proje: Ateş Fiat/);
    expect(brief).toMatch(/UTF-8 bozulması/);
    expect(brief).toMatch(/Install\.php sihirbazı/);
    expect(brief.length).toBeLessThanOrEqual(1600 + 3);
  });

  test("aktif proje yoksa boş string (asla throw)", () => {
    expect(ace.buildBrief()).toBe("");
  });

  test("uzun içerik maxChars ile kırpılır", () => {
    ace.projectBrain.getOrCreate("Big");
    ace.workingMemory.setProject("Big");
    for (let i = 0; i < 50; i++) ace.projectBrain.addOpenTodo("Big", "Uzun bir açık iş kaydı numarası " + i);
    const brief = ace.buildBrief({ maxChars: 200 });
    expect(brief.length).toBeLessThanOrEqual(203);
  });

  test("recordTurn sonrası sohbet konusu brief'e yansır", () => {
    ace.projectBrain.getOrCreate("Proj");
    ace.workingMemory.setProject("Proj");
    ace.recordTurn({ userMessage: "Builder'a Docker ekle", assistantText: "Docker eklendi" });
    const brief = ace.buildBrief();
    expect(brief).toMatch(/Docker/);
  });
});
