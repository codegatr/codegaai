"use strict";

// AEP Yol Koruması (alpha.108): otonom patch hattı, CODEGA_RULES §Autonomous Development
// gereği workflow/sır/updater/preload/settings-store dosyalarına ya da depo dışına
// (traversal/mutlak yol) yazamaz. path-guard tek doğruluk kaynağı; SelfQA (push sonrası)
// ve patch-generator (push ÖNCESİ) bu kapıyı paylaşır.

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const { classifyPatchPath, guardPatchSet, normalizePatchPath, BLOCK_REASON } =
  require("../aep/path-guard");
const { SelfQAAgent, BLOCKER } = require("../aep/self-qa-agent");
const { PatchGenerator, PATCH_STATUS } = require("../aep/patch-generator");

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "aep-guard-"));

describe("classifyPatchPath: izinli yollar", () => {
  const ALLOWED = [
    "src/main/agent/foo.js",
    "src/main/agent/__tests__/foo.test.js",
    "docs/README.md",
    "src/renderer/styles.css",
    "./src/main/model-manager.js",
  ];
  test.each(ALLOWED)("izinli: %s", (p) => {
    expect(classifyPatchPath(p).allowed).toBe(true);
  });
});

describe("classifyPatchPath: korumalı/geçersiz yollar bloklanır", () => {
  const CASES = [
    [".github/workflows/release.yml", BLOCK_REASON.WORKFLOW],
    ["apps/x/.github/workflows/ci.yml", BLOCK_REASON.WORKFLOW],
    [".gitlab-ci.yml", BLOCK_REASON.WORKFLOW],
    [".env", BLOCK_REASON.SECRET],
    [".env.production", BLOCK_REASON.SECRET],
    ["certs/server.pem", BLOCK_REASON.SECRET],
    ["keys/deploy.key", BLOCK_REASON.SECRET],
    ["home/id_rsa", BLOCK_REASON.SECRET],
    ["config/secrets.json", BLOCK_REASON.CREDENTIAL],
    ["config/credentials.yml", BLOCK_REASON.CREDENTIAL],
    [".npmrc", BLOCK_REASON.CREDENTIAL],
    ["src/main/update-service.js", BLOCK_REASON.UPDATER],
    ["app-update.yml", BLOCK_REASON.UPDATER],
    ["dist/latest.yml", BLOCK_REASON.UPDATER],
    ["src/main/preload.js", BLOCK_REASON.PRELOAD],
    ["src/main/agent/settings-store.js", BLOCK_REASON.SETTINGS_STORE],
    ["data/agent-settings.json", BLOCK_REASON.SETTINGS_STORE],
    ["../../etc/passwd", BLOCK_REASON.PATH_TRAVERSAL],
    ["src/../../escape.js", BLOCK_REASON.PATH_TRAVERSAL],
    ["/etc/hosts", BLOCK_REASON.ABSOLUTE_PATH],
    ["C:/Windows/system32/x.dll", BLOCK_REASON.ABSOLUTE_PATH],
    ["", BLOCK_REASON.EMPTY_PATH],
    ["   ", BLOCK_REASON.EMPTY_PATH],
  ];
  test.each(CASES)("bloklanır: %s → %s", (p, reason) => {
    const v = classifyPatchPath(p);
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe(reason);
  });
});

describe("normalizePatchPath", () => {
  test("ters eğik çizgi düz çizgiye çevrilir (Windows yolu)", () => {
    expect(normalizePatchPath("src\\main\\preload.js")).toBe("src/main/preload.js");
  });
  test("ters eğik çizgili preload yine bloklanır", () => {
    expect(classifyPatchPath("src\\main\\preload.js").reason).toBe(BLOCK_REASON.PRELOAD);
  });
});

describe("guardPatchSet: karışık set", () => {
  test("bir tane korumalı yol tüm seti reddeder", () => {
    const r = guardPatchSet([
      { path: "src/main/agent/foo.js", content: "ok" },
      { path: ".github/workflows/release.yml", content: "bad" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.blocked).toHaveLength(1);
    expect(r.blocked[0].reason).toBe(BLOCK_REASON.WORKFLOW);
    expect(r.allowed).toContain("src/main/agent/foo.js");
  });
  test("hepsi izinliyse geçer", () => {
    const r = guardPatchSet([
      { path: "src/main/agent/foo.js", content: "a" },
      { path: "src/main/agent/__tests__/foo.test.js", content: "b" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.blocked).toHaveLength(0);
  });
});

describe("SelfQAAgent: korumalı yol PR'ı bloklar", () => {
  test("workflow'a yazan patch PROTECTED_PATH ile bloklanır", () => {
    const qa = new SelfQAAgent();
    const review = qa.review({
      patches: [
        { path: "src/main/agent/foo.js", content: "x" },
        { path: "src/main/agent/__tests__/foo.test.js", content: "expect(1).toBe(1)" },
        { path: ".github/workflows/release.yml", content: "steal secrets" },
      ],
      testResults: { total: 1, passed: 1, failed: 0 },
    });
    expect(review.ok).toBe(false);
    expect(review.blockers.some((b) => b.code === BLOCKER.PROTECTED_PATH)).toBe(true);
  });
});

describe("PatchGenerator: korumalı yol PUSH ÖNCESİ durdurur", () => {
  test("preload'a yazan LLM patch'i push edilmeden qa_blocked olur", async () => {
    const dir = tmpDir();
    const gen = new PatchGenerator({
      projectRoot: process.cwd(),
      dataDir: dir,
      githubToken: "", // token yok → ağ/branch/push çağrısı yapılmaz
      owner: "o",
      repo: "r",
    });
    // LLM'in korumalı yola yazmaya çalıştığı senaryo.
    gen._generatePatches = async () => [{ path: "src/main/preload.js", content: "malicious" }];
    let pushed = false;
    gen._pushPatches = async () => { pushed = true; };
    let testsRan = false;
    gen._runTests = async () => { testsRan = true; return { total: 0, passed: 0, failed: 0 }; };

    const task = { id: "ET-GUARD1", title: "x", description: "d" };
    const proposal = { id: "IP-GUARD1", title: "x", implementation: "y", affectedFiles: [] };
    const res = await gen.run(task, proposal);

    expect(res.status).toBe(PATCH_STATUS.QA_BLOCKED);
    expect(res.error).toMatch(/Yol koruması/);
    expect(pushed).toBe(false);   // uzak dala hiç gitmedi
    expect(testsRan).toBe(false); // guard testlerden ÖNCE durdurdu
  });
});
