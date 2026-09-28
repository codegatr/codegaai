"use strict";

// DOĞRULANABİLİR SELF-PATCH: AEP patch'i yerel çalışma ağacına uygular, check.mjs + jest
// koşturur, ağacı eski haline getirir ve YALNIZ yeşilse push+PR açar. Böylece otonom evrim
// ürettiği değişikliği gerçekten doğrular (eskiden testler patch push edildikten sonra
// yamasız yerel ağaçta koşuyordu = anlamsız). Ağır check/jest bu testte stub'lanır.

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const { PatchGenerator, PATCH_STATUS } = require("../aep/patch-generator");

function tmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aep-vsp-"));
  fs.mkdirSync(path.join(root, "apps/codegaai-desktop"), { recursive: true });
  return root;
}

function makeGen(root) {
  return new PatchGenerator({
    projectRoot: root,
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "aep-vsp-data-")),
    githubToken: "", // token yok → ağ/branch/push yok
    owner: "o",
    repo: "r",
  });
}

describe("_verifyPatchesLocally: uygula → doğrula → geri al", () => {
  test("yeşil: check+jest geçerse ok=true; yeni dosya doğrulama SONRASI geri alınır (silinir)", async () => {
    const root = tmpProject();
    const gen = makeGen(root);
    gen._runIntegrityCheck = async () => ({ ok: true });
    gen._runTests = async () => ({ total: 5, passed: 5, failed: 0 });

    const rel = "src/x/foo.js";
    const v = await gen._verifyPatchesLocally([{ path: rel, content: "module.exports = 1;" }]);
    expect(v.ok).toBe(true);
    expect(v.checkOk).toBe(true);
    expect(v.testResults.passed).toBe(5);
    // Çalışma ağacı temiz kalmalı: yeni dosya geri alımda silinmiş olmalı.
    expect(fs.existsSync(path.join(root, "apps/codegaai-desktop", rel))).toBe(false);
  });

  test("kırmızı (test başarısız): ok=false, hata mesajı, dosya geri alınır", async () => {
    const root = tmpProject();
    const gen = makeGen(root);
    gen._runIntegrityCheck = async () => ({ ok: true });
    gen._runTests = async () => ({ total: 5, passed: 4, failed: 1 });

    const v = await gen._verifyPatchesLocally([{ path: "src/x/bad.js", content: "x" }]);
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/test başarısız/);
    expect(fs.existsSync(path.join(root, "apps/codegaai-desktop", "src/x/bad.js"))).toBe(false);
  });

  test("kırmızı (check başarısız): jest hiç çalıştırılmaz, testResults null", async () => {
    const root = tmpProject();
    const gen = makeGen(root);
    let testsRan = false;
    gen._runIntegrityCheck = async () => ({ ok: false, error: "syntax error" });
    gen._runTests = async () => { testsRan = true; return { total: 1, passed: 1, failed: 0 }; };

    const v = await gen._verifyPatchesLocally([{ path: "src/x/c.js", content: "x" }]);
    expect(v.ok).toBe(false);
    expect(v.checkOk).toBe(false);
    expect(v.testResults).toBeNull();
    expect(testsRan).toBe(false);
  });

  test("var olan dosya: doğrulama SIRASINDA patch'li, SONRASINDA orijinaline döner", async () => {
    const root = tmpProject();
    const abs = path.join(root, "apps/codegaai-desktop", "src/y/bar.js");
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "ORIGINAL", "utf8");

    const gen = makeGen(root);
    let seenDuringVerify = null;
    gen._runIntegrityCheck = async () => ({ ok: true });
    gen._runTests = async () => { seenDuringVerify = fs.readFileSync(abs, "utf8"); return { total: 1, passed: 1, failed: 0 }; };

    const v = await gen._verifyPatchesLocally([{ path: "src/y/bar.js", content: "PATCHED" }]);
    expect(v.ok).toBe(true);
    expect(seenDuringVerify).toBe("PATCHED");      // doğrulama patch'li halde koştu
    expect(fs.readFileSync(abs, "utf8")).toBe("ORIGINAL"); // sonra geri alındı
  });

  test("appDir dışına çıkan yol reddedilir (ikinci savunma)", async () => {
    const root = tmpProject();
    const gen = makeGen(root);
    gen._runIntegrityCheck = async () => ({ ok: true });
    gen._runTests = async () => ({ total: 1, passed: 1, failed: 0 });
    const v = await gen._verifyPatchesLocally([{ path: "../../escape.js", content: "x" }]);
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/appDir dışında/);
  });
});

describe("run(): doğrulama push'u geçitler", () => {
  test("kırmızı doğrulama → push YOK, status FAILED", async () => {
    const root = tmpProject();
    const gen = makeGen(root);
    gen._generatePatches = async () => [{ path: "src/z/ok.js", content: "1" }];
    gen._verifyPatchesLocally = async () => ({ ok: false, checkOk: true, testResults: { total: 1, passed: 0, failed: 1 }, error: "1 test başarısız" });
    let pushed = false, branched = false;
    gen._pushPatches = async () => { pushed = true; };
    gen._createGitHubBranch = async () => { branched = true; };

    const res = await gen.run({ id: "ET-VSP1", title: "x", description: "d" }, { id: "IP-VSP1", title: "x", implementation: "y", affectedFiles: [] });
    expect(res.status).toBe(PATCH_STATUS.FAILED);
    expect(res.error).toMatch(/Yerel doğrulama başarısız/);
    expect(pushed).toBe(false);
    expect(branched).toBe(false);
  });

  test("yeşil doğrulama (token yok) → doğrulama koşar, push YOK, testResults taşınır", async () => {
    const root = tmpProject();
    const gen = makeGen(root);
    gen._generatePatches = async () => [{ path: "src/z/ok.js", content: "1" }];
    gen._verifyPatchesLocally = async () => ({ ok: true, checkOk: true, testResults: { total: 3, passed: 3, failed: 0 }, error: null });
    let pushed = false, branched = false;
    gen._pushPatches = async () => { pushed = true; };
    gen._createGitHubBranch = async () => { branched = true; };

    const res = await gen.run({ id: "ET-VSP2", title: "x", description: "d" }, { id: "IP-VSP2", title: "x", implementation: "y", affectedFiles: [] });
    expect(res.testResults.passed).toBe(3);
    expect(res.verification.ok).toBe(true);
    expect(pushed).toBe(false);    // token yok
    expect(branched).toBe(false);  // token yok
  });
});
