"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { ModelManager } = require("../../model-manager");
const answerAdequacy = require("../answer-adequacy");
const { chunkQuestions } = require("../prompt-splitter");

const MULTI_TECH_PROMPT = [
  "[Güvenlik] package.json dosyasını elektrik kesintisi anında invalid JSON olmaktan koruyan fs.rename tabanlı atomik yazma stratejisi nasıl kodlanır?",
  "[Veri Bütünlüğü] manifest.json güncellenip inc/version.php yazılırken hata alınırsa staged rollback döngüsü nasıl kurulur?",
  "[Eşzamanlılık] release.ps1 ve Electron render aynı package.json dosyasına yazmaya çalışırsa yerel Mutex ile race condition nasıl çözülür?",
  "[Tedarik Zinciri] package.json overrides politikası supply chain attack riskini azaltmak için nasıl olmalıdır?",
  "[Sürüm Doğrulama] TOPLAM_MODUL_SAYISI gibi hardcoded PHP sabitlerini yakalayan regex pipeline'a nasıl entegre edilir?",
].join("\n\n");

describe("ModelManager irrelevant short answer guard", () => {
  let settingsDir;
  let oldSettingsPath;

  beforeEach(() => {
    oldSettingsPath = process.env.CODEGA_SETTINGS_PATH;
    settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), "codega-short-answer-"));
    process.env.CODEGA_SETTINGS_PATH = path.join(settingsDir, "settings.json");
  });

  afterEach(() => {
    if (oldSettingsPath === undefined) delete process.env.CODEGA_SETTINGS_PATH;
    else process.env.CODEGA_SETTINGS_PATH = oldSettingsPath;
    fs.rmSync(settingsDir, { recursive: true, force: true });
  });

  test("outer ask guard never returns a lone numeric answer for long technical prompts", async () => {
    fs.writeFileSync(process.env.CODEGA_SETTINGS_PATH, JSON.stringify({ promptChunking: false }), "utf8");
    const manager = new ModelManager();
    manager._ask = async () => ({ provider: "test", model: "fake", text: "0.75" });

    const result = await manager.ask(MULTI_TECH_PROMPT);

    expect(result.text).toBe(answerAdequacy.CONTROLLED_RETRY_MESSAGE);
    expect(result.text).not.toBe("0.75");
  });

  test("batched chunks replace irrelevant short chunk answers with controlled messages", async () => {
    const manager = new ModelManager();
    manager._ask = async () => ({ provider: "test", model: "fake", text: "0.75" });

    const batch = chunkQuestions(MULTI_TECH_PROMPT);
    const result = await manager._askBatched(MULTI_TECH_PROMPT, batch);

    expect(result.source).toBe("batched");
    expect(result.text).toMatch(/## Sorular 1/);
    expect(result.text).toMatch(/## Sorular 5/);
    expect(result.text).toContain(answerAdequacy.CONTROLLED_RETRY_MESSAGE);
    expect(result.text).not.toMatch(/(^|\n)0\.75(\n|$)/);
  });
});
