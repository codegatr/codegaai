"use strict";

/**
 * build-intent.js — "dosya üret + diske yaz + ZIP'le" isteğini saptar.
 *
 * CODEGA'nın chat'te bahane üretmek yerine GERÇEK teslim (yaz+zip) akışını
 * tetiklemesi için. Saf + test edilebilir.
 */

function fold(s) {
  return String(s || "").toLowerCase()
    .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u");
}

// Üretim fiili (oluştur/inşa/yaz/üret/hazırla) + paketleme/klasör sinyali.
const CREATE_RE = /\b(olustur|insa et|insa|yaz|uret|hazirla|kur|build|generate|create)\b/;
const PACKAGE_RE = /\b(zip|zip'le|ziple|paketle|arsivle|arsiv|package|klasor|folder|dizin)\b/;

function detectDeliverIntent(prompt) {
  const t = fold(prompt);
  const isDeliver = CREATE_RE.test(t) && PACKAGE_RE.test(t);
  if (!isDeliver) return { isDeliver: false };

  return {
    isDeliver: true,
    folder: extractFolder(prompt),
    zipName: extractZipName(prompt),
  };
}

// "codega-muayene-sistemi/ klasörü" veya "<ad> adında bir klasör".
function extractFolder(prompt) {
  const raw = String(prompt || "");
  let m = raw.match(/([A-Za-z0-9._\-çğıöşüÇĞİÖŞÜ]{2,60})\/\s*(?:adinda|adında|isimli|klas[oö]r)/i);
  if (m) return sanitizeFolder(m[1]);
  m = raw.match(/([A-Za-z0-9._\-]{2,60})\s+ad[ıi]nda\s+(?:bir\s+)?klas[oö]r/i);
  if (m) return sanitizeFolder(m[1]);
  m = raw.match(/([A-Za-z0-9._\-]{2,60})\/(?:\s|$)/);
  if (m) return sanitizeFolder(m[1]);
  return "codega-project";
}

// "muayene-sistemi.zip" gibi açık ZIP adı.
function extractZipName(prompt) {
  const m = String(prompt || "").match(/([A-Za-z0-9._\-]{2,60}\.zip)\b/i);
  return m ? m[1] : "";
}

function sanitizeFolder(name) {
  const s = String(name || "").trim().replace(/[^\w.\-]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "codega-project";
}

module.exports = { detectDeliverIntent, extractFolder, extractZipName };
