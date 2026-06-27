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

// electron-builder ile birlikte gelen modüller
let extractZip, archiver;
try { extractZip = require("extract-zip"); } catch (_e) {}
try { archiver = require("archiver"); } catch (_e) {}

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

/**
 * Tüm arşivi bir klasöre çıkarır.
 * @param {string} zipPath
 * @param {string} destDir
 */
async function extract(zipPath, destDir) {
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
        arch.file(disk, { name: zipName });
      }
    }
    arch.finalize();
  });
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

module.exports = { list, extract, readFile, create, patch };
