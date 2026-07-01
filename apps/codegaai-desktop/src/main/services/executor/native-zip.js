"use strict";

/**
 * native-zip.js — Zero-dependency (harici npm YOK) OS-native ZIP.
 *
 * archiver yerine işletim sisteminin yerleşik komutlarını kullanır:
 *   - win32  → PowerShell Compress-Archive (Win10+ her zaman vardır)
 *   - linux/darwin → `zip -r` (yoksa temiz hata)
 *
 * execFile promisify edilir → Event Loop BLOKLANMAZ. Hatalar TEMİZ obje olarak
 * fırlatılır (renderer'a IPC üzerinden güvenle taşınabilir): { code, message, platform, engine }.
 */

const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fsp  = require("node:fs/promises");
const fs   = require("node:fs");
const path = require("node:path");

const execFileP = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;

function zipError(code, message, cause) {
  const e = new Error(message);
  e.name = "NativeZipError";
  e.code = code;
  e.platform = process.platform;
  if (cause && cause.message) e.cause = cause.message;
  return e;
}

/**
 * Bir klasörün İÇERİĞİNİ ZIP'ler (zip kökünde dosyalar).
 * @param {string} sourceDir  paketlenecek klasör
 * @param {string} destZip    hedef .zip yolu
 * @returns {Promise<{ok:true, zipPath:string, engine:string}>}
 */
async function zipDirectory(sourceDir, destZip) {
  const src = path.resolve(String(sourceDir || ""));
  const dest = path.resolve(String(destZip || ""));
  if (!src || !dest) throw zipError("BAD_ARGS", "sourceDir ve destZip zorunlu");

  try {
    const st = await fsp.stat(src);
    if (!st.isDirectory()) throw zipError("NOT_A_DIR", `Kaynak klasör değil: ${src}`);
  } catch (e) {
    if (e && e.code === "NOT_A_DIR") throw e;
    throw zipError("SOURCE_MISSING", `Kaynak klasör bulunamadı: ${src}`, e);
  }

  await fsp.mkdir(path.dirname(dest), { recursive: true });
  // Deterministik çıktı: varsa eski ZIP'i sil (posix `zip` aksi halde ekler).
  try { if (fs.existsSync(dest)) await fsp.unlink(dest); } catch (_e) {}

  if (process.platform === "win32") {
    // Compress-Archive: -Path "src\*" → klasörün İÇERİĞİ zip köküne. -Force overwrite.
    const psPath = src.replace(/'/g, "''");
    const psDest = dest.replace(/'/g, "''");
    const cmd = `Compress-Archive -Path '${psPath}\\*' -DestinationPath '${psDest}' -Force`;
    try {
      await execFileP("powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", cmd],
        { windowsHide: true, maxBuffer: MAX_BUFFER });
    } catch (e) {
      if (e && e.code === "ENOENT") throw zipError("POWERSHELL_MISSING", "PowerShell bulunamadı.", e);
      if (/AccessDenied|UnauthorizedAccess|denied/i.test(String(e && e.stderr || e))) throw zipError("EACCES", "ZIP yazma izni yok (yetki hatası).", e);
      throw zipError("COMPRESS_ARCHIVE_FAILED", `Compress-Archive başarısız: ${String(e && (e.stderr || e.message)).slice(0, 200)}`, e);
    }
    return { ok: true, zipPath: dest, engine: "compress-archive" };
  }

  // linux / darwin: cd sourceDir && zip -r -q dest .
  try {
    await execFileP("zip", ["-r", "-q", dest, "."], { cwd: src, maxBuffer: MAX_BUFFER });
  } catch (e) {
    if (e && e.code === "ENOENT") throw zipError("ZIP_NOT_INSTALLED", "Sistemde 'zip' komutu yok (kur: apt install zip / brew install zip).", e);
    if (e && (e.code === "EACCES" || /permission denied/i.test(String(e.stderr || e)))) throw zipError("EACCES", "ZIP yazma izni yok (yetki hatası).", e);
    throw zipError("ZIP_FAILED", `zip başarısız: ${String(e && (e.stderr || e.message)).slice(0, 200)}`, e);
  }
  return { ok: true, zipPath: dest, engine: "zip" };
}

/** OS-native zip komutu kullanılabilir mi? (yumuşak kontrol) */
async function isNativeZipAvailable() {
  try {
    if (process.platform === "win32") {
      await execFileP("powershell.exe", ["-NoProfile", "-Command", "Get-Command Compress-Archive | Out-Null"], { windowsHide: true, maxBuffer: MAX_BUFFER });
      return true;
    }
    await execFileP("zip", ["-v"], { maxBuffer: MAX_BUFFER });
    return true;
  } catch (_e) {
    return false;
  }
}

// Native ZIP hatasını KULLANICI-DOSTU, eyleme dönük Türkçe mesaja çevir.
function userMessageForZipError(err) {
  const code = err && err.code;
  switch (code) {
    case "ZIP_NOT_INSTALLED":
      return "Sisteminizde 'zip' komutu yok. Kurun: Linux → `sudo apt install zip`, macOS → `brew install zip`. Sonra tekrar deneyin.";
    case "EACCES":
      return "ZIP yazma izni yok — hedef klasörün yazma izinlerini kontrol edin.";
    case "POWERSHELL_MISSING":
      return "PowerShell bulunamadı; Windows'ta ZIP oluşturulamadı.";
    case "SOURCE_MISSING":
      return "Paketlenecek klasör bulunamadı.";
    case "NOT_A_DIR":
      return "Kaynak bir klasör değil.";
    case "COMPRESS_ARCHIVE_FAILED":
    case "ZIP_FAILED":
      return "ZIP oluşturulurken bir hata oluştu (sistem sıkıştırma komutu başarısız).";
    default:
      return (err && err.message) ? err.message : "Bilinmeyen ZIP hatası.";
  }
}

module.exports = { zipDirectory, isNativeZipAvailable, zipError, userMessageForZipError };
