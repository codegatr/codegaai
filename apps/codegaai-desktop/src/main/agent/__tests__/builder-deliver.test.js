"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { detectDeliverIntent } = require("../builder/build-intent");
const { extractFiles } = require("../builder/extract-files");
const { executeProject } = require("../builder/project-executor");

describe("build-intent: teslim isteği saptama", () => {
  test("muayene prompt'u teslim isteği (folder + zip adı çıkarılır)", () => {
    const p = "Proje kök dizininde codega-muayene-sistemi/ adında bir klasör oluştur ... klasörü kök dizinde muayene-sistemi.zip adıyla paketle.";
    const d = detectDeliverIntent(p);
    expect(d.isDeliver).toBe(true);
    expect(d.folder).toBe("codega-muayene-sistemi");
    expect(d.zipName).toBe("muayene-sistemi.zip");
  });

  test("normal soru teslim DEĞİL", () => {
    expect(detectDeliverIntent("requestAnimationFrame nedir?").isDeliver).toBe(false);
    expect(detectDeliverIntent("bana bir PHP fonksiyonu açıkla").isDeliver).toBe(false);
  });
});

describe("extract-files: kod bloklarından dosya", () => {
  test("yol etiketli bloklar dosyaya çevrilir", () => {
    const text = "İşte:\n```sql schema.sql\nCREATE TABLE araclar (id INT);\n```\nve\n```php config.php\n<?php function db_baglan(){}\n```";
    const files = extractFiles(text);
    expect(files.map((f) => f.path)).toEqual(["schema.sql", "config.php"]);
    expect(files[0].content).toMatch(/CREATE TABLE araclar/);
    expect(files[1].content).toMatch(/db_baglan/);
  });

  test("yol yoksa dilden ad üretir; tekrar eden yol benzersizleşir", () => {
    const text = "```php\n<?php echo 1;\n```\n```php config.php\nA\n```\n```php config.php\nB\n```";
    const files = extractFiles(text);
    expect(files[0].path).toBe("dosya-1.php");
    expect(files[1].path).toBe("config.php");
    expect(files[2].path).toBe("config-2.php");
  });
});

describe("project-executor: yaz + ZIP (güvenli)", () => {
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "codega-exec-")); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test("dosyaları yazar, klasörü ZIP'ler", async () => {
    const files = [
      { path: "schema.sql", content: "CREATE TABLE x(id INT);" },
      { path: "config.php", content: "<?php function db_baglan(){}" },
      { path: "index.php", content: "<?php echo 'ok';" },
    ];
    const r = await executeProject({ workspaceRoot: root, folder: "codega-muayene-sistemi", files, zipName: "muayene-sistemi.zip" });
    expect(r.ok).toBe(true);
    expect(r.written).toBe(3);
    expect(fs.existsSync(path.join(r.dir, "schema.sql"))).toBe(true);
    expect(fs.existsSync(r.zipPath)).toBe(true);
    expect(fs.statSync(r.zipPath).size).toBeGreaterThan(0);
    expect(r.zipName).toBe("muayene-sistemi.zip");
  });

  test("path traversal dosyası REDDEDİLİR, güvenli olanlar yazılır", async () => {
    const files = [
      { path: "ok.php", content: "<?php" },
      { path: "../escape.php", content: "kotu" },
      { path: "sub/../../escape2.php", content: "kotu" },
    ];
    const r = await executeProject({ workspaceRoot: root, folder: "proj", files });
    expect(r.written).toBe(1);
    expect(r.skipped.length).toBe(2);
    // kök dışına hiçbir şey yazılmamalı
    expect(fs.existsSync(path.join(root, "escape.php"))).toBe(false);
  });

  test("dosya yoksa hata", async () => {
    await expect(executeProject({ workspaceRoot: root, folder: "p", files: [] })).rejects.toThrow(/dosya yok/i);
  });
});
