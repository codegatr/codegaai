"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { detectDeliverIntent } = require("../builder/build-intent");
const { extractFiles } = require("../builder/extract-files");
const {
  buildPackPhp,
  buildSeparateCodeBlockContract,
  detectZipBundlingRisk,
  normalizeGeneratedProject,
  renderFilesAsMarkdown,
} = require("../builder/file-parser-packer-engine");
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

  test("gerçek Türkçe oluştur + ZIP ifadesi teslim akışını tetikler", () => {
    expect(detectDeliverIntent("Dosyaları oluştur ve projeyi ZIP olarak ver").isDeliver).toBe(true);
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

  test("iki nokta etiketi (```php:config.php) dosya adı verir", () => {
    const text = "```php:config.php\n<?php $x=1;\n```\n```apache:.htaccess\nRewriteEngine On\n```";
    const files = extractFiles(text);
    expect(files.map((f) => f.path)).toEqual(["config.php", ".htaccess"]);
  });

  test("yorum yönergesi (// dosya: x) dosya adı verir ve yönerge satırı temizlenir", () => {
    const text = "```php\n// dosya: config.php\n<?php $db=1;\n```";
    const files = extractFiles(text);
    expect(files[0].path).toBe("config.php");
    expect(files[0].content).not.toMatch(/dosya:/);
    expect(files[0].content).toMatch(/\$db=1/);
  });

  test("içerik sezgisi: etiket/yorum yoksa gerçek isim (jenerik değil)", () => {
    const text = [
      "```sql\nCREATE TABLE araclar(id INT);\n```",
      "```apache\nRewriteEngine On\nRewriteRule ^ index.php\n```",
      "```html\n<!DOCTYPE html>\n<html><body>ok</body></html>\n```",
      "```php\n<?php $pdo = new PDO('mysql:host=localhost', 'u', 'p');\n```",
    ].join("\n");
    const files = extractFiles(text);
    expect(files.map((f) => f.path)).toEqual([
      "schema.sql", ".htaccess", "index.php", "config.php",
    ]);
  });

  test("path traversal içeren etiket normalize edilir (kök dışına çıkmaz kısmı)", () => {
    const files = extractFiles("```php ./sub/config.php\n<?php\n```");
    expect(files[0].path).toBe("sub/config.php");
  });
});

describe("file-parser-packer-engine: guvenli dosya ayrisma + pack.php", () => {
  test("pack.php diskten addFile ile paketler; addFromString kullanmaz ve 20 satiri gecmez", () => {
    const pack = buildPackPhp({ zipName: "demo.zip" });
    expect(pack).toMatch(/ZipArchive/);
    expect(pack).toMatch(/addFile/);
    expect(pack).not.toMatch(/addFromString/);
    expect(pack.split(/\r?\n/).length).toBeLessThanOrEqual(20);
  });

  test("proje sozlesmesi ayri code block ve pack.php kuralini zorlar", () => {
    const contract = buildSeparateCodeBlockContract({ zipName: "demo.zip" });
    expect(contract).toMatch(/AYRI Markdown kod blogu/);
    expect(contract).toMatch(/pack\.php/);
    expect(contract).toMatch(/addFromString/);
  });

  test("ayri dosya bloklarini normalize eder ve eksikse pack.php ekler", () => {
    const text = [
      "```php index.php",
      "<?php echo 'ok';",
      "```",
      "```sql schema.sql",
      "CREATE TABLE users(id INT);",
      "```",
    ].join("\n");
    const r = normalizeGeneratedProject(text, { zipName: "demo.zip" });
    expect(r.diagnostics.needsRetry).toBe(false);
    expect(r.files.map((f) => f.path)).toEqual(["index.php", "schema.sql", "pack.php"]);
    expect(r.files.find((f) => f.path === "pack.php").content).toMatch(/demo\.zip/);
  });

  test("tek dev ZipArchive/addFromString bundling riskini yakalar", () => {
    const text = "```php build.php\n<?php $zip=new ZipArchive(); $zip->addFromString('index.php','<?php echo 1;');\n```";
    const risk = detectZipBundlingRisk(text);
    const r = normalizeGeneratedProject(text);
    expect(risk.isRisky).toBe(true);
    expect(r.diagnostics.errors).toContain("MONOLITHIC_ZIP_BUNDLING");
    expect(r.diagnostics.needsRetry).toBe(true);
  });

  test("kapanmamis kod blogunu retry gerektiren yarim dosya olarak isaretler", () => {
    const r = normalizeGeneratedProject("```php index.php\n<?php echo 'yarim';");
    expect(r.diagnostics.unclosedFence).toBe(true);
    expect(r.retryInstruction).toMatch(/yarim kalan dosyayi/);
  });

  test("normalize edilen dosyalar tekrar markdown olarak ayri bloklara doner", () => {
    const out = renderFilesAsMarkdown([{ path: "app/index.php", content: "<?php echo 'ok';" }]);
    expect(out).toMatch(/```php app\/index\.php/);
    expect(out).toMatch(/echo 'ok'/);
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
