"use strict";

/**
 * atomic-json-store.js — Çökme/elektrik-kesintisi dayanıklı JSON store.
 *
 * Yazma: tmp dosyaya yaz → fsync → (önceki sağlamı .bak'a kopyala) → atomik
 * rename → mümkünse parent dizini fsync. Böylece primary dosya HİÇBİR ZAMAN
 * yarım/bozuk kalmaz.
 * Okuma: önce primary; bozuksa .bak fallback. İsteğe bağlı stat-stabilite
 * kontrolü (yarım yazma anında okumayı önle).
 *
 * Saf Node; senkron yazma (küçük store), async stabilite bekleme (non-blocking).
 */

const fs   = require("node:fs");
const path = require("node:path");

function fsyncDir(dirPath) {
  let fd = null;
  try {
    fd = fs.openSync(dirPath, "r");
    fs.fsyncSync(fd);
  } catch (_e) {
    // Windows'ta dizin fsync desteklenmeyebilir — "mümkünse" dene, yut.
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch (_e) {} }
  }
}

/**
 * JSON'u atomik + yedekli yaz.
 * @param {string} filePath
 * @param {any} data
 */
function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  const tmp = `${filePath}.tmp`;
  const bak = `${filePath}.bak`;
  fs.mkdirSync(dir, { recursive: true });

  const json = JSON.stringify(data, null, 2);

  // 1) tmp'ye yaz + fsync.
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, json, "utf8");
    try { fs.fsyncSync(fd); } catch (_e) {}
  } finally {
    fs.closeSync(fd);
  }

  // 2) Önceki SAĞLAM primary'yi .bak'a kopyala (rename'den ÖNCE).
  if (fs.existsSync(filePath)) {
    try { fs.copyFileSync(filePath, bak); } catch (_e) { /* bak yazılamazsa devam */ }
  }

  // 3) Atomik rename tmp → primary.
  fs.renameSync(tmp, filePath);

  // 4) Parent dizini fsync (mümkünse) — rename'in kalıcılığı için.
  fsyncDir(dir);

  return { ok: true, path: filePath };
}

function _parseFile(p) {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

/**
 * Güvenli oku: primary bozuksa .bak'a düş. Asla istisna fırlatmaz.
 * @returns {{ok:boolean, data?:any, source?:"primary"|"backup", error?:string}}
 */
function readJsonSafe(filePath) {
  const bak = `${filePath}.bak`;
  try {
    return { ok: true, data: _parseFile(filePath), source: "primary" };
  } catch (ePrimary) {
    if (ePrimary && ePrimary.code === "ENOENT") {
      // primary yok; .bak var mı?
    }
    try {
      return { ok: true, data: _parseFile(bak), source: "backup" };
    } catch (eBak) {
      return { ok: false, error: `primary: ${ePrimary && ePrimary.message}; backup: ${eBak && eBak.message}` };
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Dosya STABİL mi? (yarım yazma anında okumayı önle): stat al → kısa bekle →
 * tekrar stat al; size/mtime değişmediyse stabil. Event-loop'u BLOKLAMAZ.
 * @returns {Promise<boolean>}
 */
async function waitForStableFile(filePath, { retries = 5, delayMs = 60 } = {}) {
  for (let i = 0; i < retries; i++) {
    let a, b;
    try { a = fs.statSync(filePath); } catch (_e) { return false; }
    await sleep(delayMs);
    try { b = fs.statSync(filePath); } catch (_e) { return false; }
    if (a.size === b.size && a.mtimeMs === b.mtimeMs) return true;
    // değişiyor → backoff ile tekrar dene
    await sleep(delayMs * (i + 1));
  }
  return false;
}

/**
 * Stabilite bekleyip güvenli oku. Parse hatasını HEMEN kalıcı sayma — kısa
 * backoff'la tekrar dener (yarım yazma olabilir), sonra .bak fallback.
 */
async function readJsonStable(filePath, { retries = 4, delayMs = 80 } = {}) {
  for (let i = 0; i < retries; i++) {
    await waitForStableFile(filePath, { retries: 3, delayMs });
    const res = readJsonSafe(filePath);
    if (res.ok) return res;
    await sleep(delayMs * (i + 1)); // backoff
  }
  return readJsonSafe(filePath); // son hâli (primary+bak ikisi de bozuksa ok:false)
}

module.exports = { writeJson, readJsonSafe, readJsonStable, waitForStableFile, fsyncDir };
