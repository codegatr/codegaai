"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { zipDirectory, isNativeZipAvailable, zipError } = require("../../services/executor/native-zip");

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "codega-nz-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("native-zip (zero-dependency OS zip)", () => {
  test("zipError temiz obje (code/platform)", () => {
    const e = zipError("X", "y");
    expect(e.name).toBe("NativeZipError");
    expect(e.code).toBe("X");
    expect(e.platform).toBe(process.platform);
  });

  test("olmayan kaynak → SOURCE_MISSING (temiz hata, çökmez)", async () => {
    await expect(zipDirectory(path.join(dir, "yok"), path.join(dir, "o.zip")))
      .rejects.toMatchObject({ code: "SOURCE_MISSING" });
  });

  test("klasör içeriğini gerçek ZIP'ler (native)", async () => {
    if (!(await isNativeZipAvailable())) return; // native yoksa ortam kısıtı — atla
    fs.writeFileSync(path.join(dir, "schema.sql"), "CREATE TABLE araclar(id INT);");
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "sub", "config.php"), "<?php function db_baglan(){}");
    const zip = path.join(dir, "out.zip");
    const r = await zipDirectory(dir, zip);
    expect(r.ok).toBe(true);
    expect(["compress-archive", "zip"]).toContain(r.engine);
    expect(fs.existsSync(zip)).toBe(true);
    expect(fs.statSync(zip).size).toBeGreaterThan(0);
  });

  test("var olan ZIP üzerine deterministik yazar (append etmez)", async () => {
    if (!(await isNativeZipAvailable())) return;
    fs.writeFileSync(path.join(dir, "a.txt"), "x");
    const zip = path.join(dir, "d.zip");
    await zipDirectory(dir, zip);
    const size1 = fs.statSync(zip).size;
    await zipDirectory(dir, zip); // ikinci kez — büyümemeli (unlink+recreate)
    const size2 = fs.statSync(zip).size;
    expect(Math.abs(size2 - size1)).toBeLessThan(50);
  });
});
