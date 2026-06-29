"use strict";

/**
 * ZipEngine — ZIP arşiv işlemleri için düşük seviyeli motor.
 *
 * Desteklenen işlemler:
 *   list(zipPath)                          → arşiv içindeki dosya listesi
 *   extract(zipPath, destDir)              → tüm arşivi bir klasöre aç
 *   extractFile(zipPath, entry, destPath)  → tek dosya çıkar
 *   readFile(zipPath, entry)               → dosya içeriğini Buffer olarak oku (çıkarmadan)
 *   create(destZip, files)                 → yeni ZIP oluştur
 *   patch(zipPath, destZip, patches)       → mevcut ZIP'e dosya ekle/değiştir/sil
 *
 * Bağımlılıklar: extract-zip (Electron ile gelen), archiver
 */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

const DEFAULT_PROJECT_SIGNATURE = "tr.com.codega.codegaai";
const PROJECT_ARCHIVE_ZLIB_LEVEL = 9;

function getExtractZip() {
  try { return require("extract-zip"); } catch (_e) { return null; }
}

function getArchiver() {
  try { return require("archiver"); } catch (_e) { return null; }
}

// ZIP central directory okuyucu — extractZip olmasa da dosya listesi alınabilsin
const ZIP_EOCD_SIG = 0x06054b50;
const ZIP_CENTRAL_SIG = 0x02014b50;

/**
 * ZIP central directory'yi parse ederek dosya listesi döner.
 * @param {string} zipPath
 * @returns {Promise<Array<{name:string, size:number, compressedSize:number, method:number}>>}
 */
async function listEntries(zipPath) {
  const buf = await fsp.readFile(zipPath);
  const entries = [];

  // EOCD'yi bul (sondan geriye ara)
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === ZIP_EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Geçersiz ZIP dosyası: EOCD imzası bulunamadı");

  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);
  const centralDirSize   = buf.readUInt32LE(eocdOffset + 12);

  let offset = centralDirOffset;
  while (offset < centralDirOffset + centralDirSize) {
    if (buf.readUInt32LE(offset) !== ZIP_CENTRAL_SIG) break;
    const method         = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const size           = buf.readUInt32LE(offset + 24);
    const nameLen        = buf.readUInt16LE(offset + 28);
    const extraLen       = buf.readUInt16LE(offset + 30);
    const commentLen     = buf.readUInt16LE(offset + 32);
    const name           = buf.slice(offset + 46, offset + 46 + nameLen).toString("utf8");
    entries.push({ name, size, compressedSize, method, isDir: name.endsWith("/") });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Belirli bir entry'nin ham içeriğini okur (method=0 → store, method=8 → deflate).
 * @param {string} zipPath
 * @param {string} entryName
 * @returns {Promise<Buffer>}
 */
async function readEntry(zipPath, entryName) {
  const zlib = require("node:zlib");
  const buf = await fsp.readFile(zipPath);

  const LOCAL_SIG = 0x04034b50;
  let offset = 0;
  while (offset < buf.length - 4) {
    if (buf.readUInt32LE(offset) !== LOCAL_SIG) break;
    const method    = buf.readUInt16LE(offset + 8);
    const compSize  = buf.readUInt32LE(offset + 18);
    const nameLen   = buf.readUInt16LE(offset + 26);
    const extraLen  = buf.readUInt16LE(offset + 28);
    const name      = buf.slice(offset + 30, offset + 30 + nameLen).toString("utf8");
    const dataStart = offset + 30 + nameLen + extraLen;

    if (name === entryName) {
      const compressed = buf.slice(dataStart, dataStart + compSize);
      if (method === 0) return compressed; // store
      if (method === 8) return new Promise((res, rej) =>
        zlib.inflateRaw(compressed, (e, d) => e ? rej(e) : res(d))
      );
      throw new Error(`Desteklenmeyen sıkıştırma yöntemi: ${method}`);
    }
    offset = dataStart + compSize;
  }
  throw new Error(`Entry bulunamadı: ${entryName}`);
}

/**
 * Arşiv içindeki dosya listesini döner.
 * @param {string} zipPath
 * @returns {Promise<Array>}
 */
async function list(zipPath) {
  return listEntries(zipPath);
}

function assertSafeEntryName(name) {
  const raw = String(name || "");
  if (!raw || raw.includes("\0")) throw new Error("Güvensiz ZIP entry: boş veya geçersiz ad");
  const normalized = raw.replace(/\\/g, "/");
  if (path.isAbsolute(normalized) || /^[a-zA-Z]:\//.test(normalized)) {
    throw new Error(`Güvensiz ZIP entry: absolute path (${raw})`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === "..")) {
    throw new Error(`Güvensiz ZIP entry: path traversal (${raw})`);
  }
  if (normalized.startsWith("/") || normalized.startsWith("./../") || normalized.includes("/../")) {
    throw new Error(`Güvensiz ZIP entry: path traversal (${raw})`);
  }
  return normalized;
}

async function assertSafeZipEntries(zipPath) {
  const entries = await listEntries(zipPath);
  for (const entry of entries) assertSafeEntryName(entry.name);
  return entries;
}

/**
 * Tüm arşivi bir klasöre çıkarır.
 * @param {string} zipPath
 * @param {string} destDir
 */
async function extract(zipPath, destDir) {
  await assertSafeZipEntries(zipPath);
  const extractZip = getExtractZip();
  if (extractZip) {
    await extractZip(zipPath, { dir: path.resolve(destDir) });
    return;
  }
  // Fallback: manuel extraction
  const entries = await listEntries(zipPath);
  await fsp.mkdir(destDir, { recursive: true });
  for (const entry of entries) {
    const dest = path.join(destDir, entry.name);
    if (entry.isDir) {
      await fsp.mkdir(dest, { recursive: true });
    } else {
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      const data = await readEntry(zipPath, entry.name);
      await fsp.writeFile(dest, data);
    }
  }
}

/**
 * ZIP içinden tek bir dosyanın içeriğini Buffer olarak okur.
 * @param {string} zipPath
 * @param {string} entryName
 * @returns {Promise<Buffer>}
 */
async function readFile(zipPath, entryName) {
  return readEntry(zipPath, entryName);
}

/**
 * Dizin içeriğinden yeni bir ZIP oluşturur.
 * @param {string} destZip
 * @param {Array<{disk:string, zip:string}>|string} source  - dosya listesi veya kaynak dizin
 */
async function create(destZip, source) {
  const archiver = getArchiver();
  if (!archiver) throw new Error("archiver modülü bulunamadı");

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destZip);
    const arch = archiver("zip", { zlib: { level: 6 } });

    output.on("close", resolve);
    arch.on("error", reject);
    arch.pipe(output);

    if (typeof source === "string") {
      // Kaynak dizin
      arch.directory(source, false);
    } else if (Array.isArray(source)) {
      for (const { disk, zip: zipName } of source) {
        arch.file(disk, { name: assertSafeEntryName(zipName) });
      }
    }
    arch.finalize();
  });
}

function defaultProjectManifest(opts = {}) {
  return {
    appId: opts.projectSignature || opts.signature || DEFAULT_PROJECT_SIGNATURE,
    projectSignature: opts.projectSignature || opts.signature || DEFAULT_PROJECT_SIGNATURE,
    version: opts.version || "1.0.0",
    createdAt: new Date().toISOString(),
    format: "codega-project-archive",
  };
}

async function hasFile(filePath) {
  return fsp.access(filePath).then(() => true).catch(() => false);
}

async function createProjectArchive(sourceDir, destZip, opts = {}) {
  const archiver = getArchiver();
  if (!archiver) throw new Error("archiver modülü bulunamadı");
  const sourceRoot = path.resolve(sourceDir);
  const archivePath = path.resolve(destZip);
  if (archivePath === sourceRoot || archivePath.startsWith(sourceRoot + path.sep)) {
    throw new Error("Proje ZIP arşivi kaynak klasörün içine kaydedilemez");
  }
  const manifestPath = path.join(sourceRoot, "manifest.json");
  const manifestExists = await hasFile(manifestPath);
  const manifest = opts.manifest || defaultProjectManifest(opts);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(archivePath);
    const arch = archiver("zip", { zlib: { level: PROJECT_ARCHIVE_ZLIB_LEVEL } });
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      err ? reject(err) : resolve({ destZip: archivePath });
    };
    output.on("close", () => done());
    output.on("error", done);
    arch.on("error", done);
    arch.pipe(output);
    arch.directory(sourceRoot, false);
    if (!manifestExists) {
      arch.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
    }
    arch.finalize().catch(done);
  });
}

async function extractToTemp(zipPath, tempDir) {
  const target = path.resolve(tempDir);
  await fsp.rm(target, { recursive: true, force: true });
  await fsp.mkdir(target, { recursive: true });
  try {
    await extract(zipPath, target);
    return target;
  } catch (err) {
    await fsp.rm(target, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

async function validateProjectManifest(tempDir, opts = {}) {
  const manifestPath = path.join(tempDir, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  } catch (_e) {
    throw new Error("Import manifest doğrulaması başarısız: manifest.json bulunamadı veya geçersiz");
  }
  const expectedSignature = opts.projectSignature || opts.signature || DEFAULT_PROJECT_SIGNATURE;
  const actualSignature = manifest.projectSignature || manifest.signature || manifest.appId || manifest.id;
  if (actualSignature !== expectedSignature) {
    throw new Error(`Import manifest doğrulaması başarısız: imza uyuşmuyor (${actualSignature || "yok"})`);
  }
  if (!manifest.version || typeof manifest.version !== "string") {
    throw new Error("Import manifest doğrulaması başarısız: sürüm bilgisi yok veya geçersiz");
  }
  if (opts.version && manifest.version !== opts.version) {
    throw new Error(`Import manifest doğrulaması başarısız: sürüm uyuşmuyor (${manifest.version || "yok"})`);
  }
  return manifest;
}

async function listFilesRecursive(rootDir) {
  const out = [];
  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(rootDir, full);
      assertSafeEntryName(rel);
      if (entry.isSymbolicLink()) throw new Error(`Import güvenlik hatası: symlink desteklenmiyor (${rel})`);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push({ full, rel });
    }
  }
  await walk(rootDir);
  return out;
}

async function commitImportedProject(tempDir, workspaceDir) {
  const sourceRoot = path.resolve(tempDir);
  const targetRoot = path.resolve(workspaceDir);
  await fsp.mkdir(targetRoot, { recursive: true });
  const backupDir = path.join(os.tmpdir(), `codega_import_backup_${crypto.randomUUID()}`);
  const copied = [];
  const backups = [];
  // Yarıda kalan staged temp dosyası rollback'te workspace'te kalmasın diye izle.
  let activeStaged = null;
  try {
    for (const file of await listFilesRecursive(sourceRoot)) {
      const target = path.resolve(targetRoot, file.rel);
      if (!target.startsWith(targetRoot + path.sep) && target !== targetRoot) {
        throw new Error(`Import güvenlik hatası: hedef workspace dışına çıkıyor (${file.rel})`);
      }
      await fsp.mkdir(path.dirname(target), { recursive: true });
      const existed = await hasFile(target);
      let backup = null;
      if (existed) {
        backup = path.join(backupDir, file.rel);
        await fsp.mkdir(path.dirname(backup), { recursive: true });
        await fsp.copyFile(target, backup);
        backups.push({ target, backup });
      }
      const staged = `${target}.codega_tmp_${crypto.randomUUID()}`;
      activeStaged = staged;
      await fsp.copyFile(file.full, staged);
      await fsp.rm(target, { force: true });
      await fsp.rename(staged, target);
      activeStaged = null; // rename başarılı → staged tüketildi
      copied.push({ target, existed });
    }
    await fsp.rm(backupDir, { recursive: true, force: true }).catch(() => {});
    return { workspaceDir: targetRoot, files: copied.length };
  } catch (err) {
    // Yarıda kalan staged temp dosyasını temizle (rm/rename öncesi/sırasında patladıysa).
    if (activeStaged) await fsp.rm(activeStaged, { force: true }).catch(() => {});
    for (const item of copied.reverse()) {
      if (!item.existed) await fsp.rm(item.target, { force: true }).catch(() => {});
    }
    for (const item of backups.reverse()) {
      await fsp.mkdir(path.dirname(item.target), { recursive: true }).catch(() => {});
      await fsp.copyFile(item.backup, item.target).catch(() => {});
    }
    await fsp.rm(backupDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

async function cleanupTempImport(tempDir) {
  await fsp.rm(tempDir, { recursive: true, force: true });
}

async function importProjectArchive(zipPath, workspaceDir, opts = {}) {
  const tempBase = opts.tempDir || path.join(os.tmpdir(), `_temp_import_${crypto.randomUUID()}`);
  try {
    await extractToTemp(zipPath, tempBase);
    const manifest = await validateProjectManifest(tempBase, opts);
    const result = await commitImportedProject(tempBase, workspaceDir);
    return { ...result, manifest };
  } finally {
    await cleanupTempImport(tempBase).catch(() => {});
  }
}

/**
 * Mevcut ZIP'e yamalar uygulayarak yeni ZIP oluşturur.
 * @param {string} srcZip   - kaynak arşiv
 * @param {string} destZip  - çıktı arşiv
 * @param {Array<{action:'add'|'modify'|'delete', name:string, content?:string|Buffer}>} patches
 */
async function patch(srcZip, destZip, patches) {
  // 1. Geçici klasöre çıkar
  const tmpDir = path.join(os.tmpdir(), `codega_zip_${crypto.randomUUID()}`);
  await extract(srcZip, tmpDir);

  // 2. Yamaları uygula
  for (const p of patches) {
    const target = path.join(tmpDir, p.name);
    if (p.action === "delete") {
      await fsp.rm(target, { force: true });
    } else if (p.action === "add" || p.action === "modify") {
      await fsp.mkdir(path.dirname(target), { recursive: true });
      const data = typeof p.content === "string"
        ? Buffer.from(p.content, "utf8")
        : (p.content || Buffer.alloc(0));
      await fsp.writeFile(target, data);
    }
  }

  // 3. Yeni ZIP oluştur
  await create(destZip, tmpDir);

  // 4. Geçici klasörü temizle
  await fsp.rm(tmpDir, { recursive: true, force: true });
}

module.exports = {
  list,
  extract,
  readFile,
  create,
  patch,
  createProjectArchive,
  extractToTemp,
  validateProjectManifest,
  commitImportedProject,
  cleanupTempImport,
  importProjectArchive,
  _assertSafeEntryName: assertSafeEntryName,
  DEFAULT_PROJECT_SIGNATURE,
  PROJECT_ARCHIVE_ZLIB_LEVEL,
};
