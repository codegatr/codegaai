"use strict";

/**
 * path-guard.js — Workspace içi yol güvenliği (path traversal / symlink kaçış).
 *
 * Renderer'dan gelen hiçbir yola GÜVENİLMEZ. Bir yolun gerçekten workspace
 * kökünün içinde kaldığını realpath ile doğrular; symlink/junction ile kök
 * dışına kaçışı bloklar. Windows yol normalizasyonu (ters slash, sürücü harfi
 * büyük/küçük, UNC) güvenli ele alınır.
 *
 * Saf + senkron + test edilebilir. fs sadece realpath/lstat için (okuma yok).
 */

const fs   = require("node:fs");
const path = require("node:path");

class PathSecurityError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "PathSecurityError";
    this.code = code || "PATH_DENIED";
  }
}

// Windows'ta sürücü harfini büyüt + ayraçları normalize et. POSIX'te no-op.
function normalizeForCompare(p) {
  let s = path.resolve(String(p || ""));
  if (process.platform === "win32") {
    s = s.replace(/\//g, "\\");
    // Sürücü harfini büyüt (c:\ -> C:\) — karşılaştırma tutarlı olsun.
    s = s.replace(/^([a-z]):/, (_m, d) => d.toUpperCase() + ":");
    return s.toLowerCase(); // Windows yol karşılaştırması case-insensitive
  }
  return s;
}

// b, a'nın altında mı? (gerçek prefix; "/a/bc" "/a/b"in altı SAYILMAZ)
function isSubPath(parent, child) {
  const p = normalizeForCompare(parent);
  const c = normalizeForCompare(child);
  if (c === p) return true;
  const sep = process.platform === "win32" ? "\\" : path.sep;
  const base = p.endsWith(sep) ? p : p + sep;
  return c.startsWith(base);
}

// Var olan en yakın üst dizinin realpath'ini al (hedef henüz yoksa bile
// symlink kaçışını yakalayabilmek için zincirin var olan kısmını çöz).
function realpathOfNearestExisting(target) {
  let current = path.resolve(target);
  const segments = [];
  // Yukarı doğru var olan ilk düğümü bul.
  for (;;) {
    try {
      // DİKKAT: realpathSync.native KULLANMA — Windows'ta 8.3 KISA ad
      // (RUNNER~1) döndürüp uzun-ad ile prefix karşılaştırmasını bozar.
      // Düz fs.realpathSync uzun/tutarlı yol verir.
      const real = fs.realpathSync(current);
      // Var olmayan kuyruğu geri ekle (normalize edilmiş).
      return segments.length ? path.join(real, ...segments.reverse()) : real;
    } catch (e) {
      if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) {
        const parent = path.dirname(current);
        if (parent === current) return path.resolve(target); // kök; çözülemedi
        segments.push(path.basename(current));
        current = parent;
        continue;
      }
      throw e;
    }
  }
}

/**
 * candidate'in workspaceRoot içinde kaldığını doğrula. Döner: güvenli mutlak yol.
 * Aksi halde PathSecurityError fırlatır.
 * @param {string} workspaceRoot
 * @param {string} candidate  renderer'dan gelmiş olabilir — GÜVENME
 */
function assertWithinRoot(workspaceRoot, candidate) {
  if (typeof workspaceRoot !== "string" || !workspaceRoot.trim()) {
    throw new PathSecurityError("workspaceRoot zorunlu", "NO_ROOT");
  }
  if (typeof candidate !== "string" || !candidate.trim()) {
    throw new PathSecurityError("yol zorunlu", "NO_PATH");
  }
  if (candidate.includes("\0")) throw new PathSecurityError("NUL bayt", "NUL_BYTE");

  // Mutlak ya da köke göreli; her hâlükârda kökün ALTINA sabitle.
  const resolved = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(workspaceRoot, candidate);

  // 1) Düz (symlink öncesi) containment — ".." ile kaçışı yakala.
  if (!isSubPath(workspaceRoot, resolved)) {
    throw new PathSecurityError(`Yol workspace dışında: ${candidate}`, "ESCAPE");
  }

  // 2) Kökün KENDİSİ symlink olabilir; kök ve hedefi gerçek yollara çözüp tekrar bak.
  let realRoot, realTarget;
  try { realRoot = realpathOfNearestExisting(workspaceRoot); } catch (_e) { realRoot = path.resolve(workspaceRoot); }
  try { realTarget = realpathOfNearestExisting(resolved); } catch (_e) { realTarget = resolved; }

  if (!isSubPath(realRoot, realTarget)) {
    throw new PathSecurityError(`Symlink/junction ile workspace dışına kaçış: ${candidate}`, "SYMLINK_ESCAPE");
  }
  return realTarget;
}

function isWithinRoot(workspaceRoot, candidate) {
  try { assertWithinRoot(workspaceRoot, candidate); return true; }
  catch (_e) { return false; }
}

module.exports = { assertWithinRoot, isWithinRoot, isSubPath, normalizeForCompare, PathSecurityError };
