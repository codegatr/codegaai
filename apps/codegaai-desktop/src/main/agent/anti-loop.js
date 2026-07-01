"use strict";

/**
 * anti-loop.js — Yerel modelin "asla bitirmeyen" tekrar/döngü çöpünü temizler.
 *
 * Küçük modeller (örn. ~4B) muhakeme sorularında aynı cümleyi/paragrafı 3-5 kez
 * arka arkaya yazıp çöpe dönüşebiliyor. Bu modül üretilmiş metni SON İŞLEM olarak
 * süzer: uzun cümlelerin tekrarını (global) ve ardışık kısa tekrarları kaldırır.
 * Kod blokları (```...```) DOKUNULMADAN korunur. Saf + test edilebilir.
 */

function foldTr(s) {
  return String(s || "")
    .replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u");
}

// Karşılaştırma için normalize: harf-küçült, TR-katla, alfasayısal-dışını boşluğa indir.
function norm(s) {
  return foldTr(String(s || "")).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const MIN_DEDUP_LEN = 40; // bu uzunluğun altındaki normalize cümleler global dedup'a girmez

// Bir prose parçasında tekrarı çöker.
function collapseProse(seg) {
  // Cümle/satır parçalarına ayır; ayraçları (boşluk/yenisatır) yakala ki biçim korunsun.
  const pieces = seg.split(/(\n+|(?<=[.!?])\s+)/);
  const seen = new Set();
  let prevNorm = "";
  let out = "";
  for (const p of pieces) {
    if (p === "" || /^\s+$/.test(p)) { out += p; continue; } // saf ayraç
    const n = norm(p);
    if (!n) { out += p; continue; }
    if (n.length >= MIN_DEDUP_LEN) {
      if (seen.has(n)) continue;      // uzun cümle daha önce geçti → at (global)
      seen.add(n);
    } else if (n === prevNorm) {
      continue;                        // kısa cümle bir öncekiyle aynı → at (ardışık)
    }
    prevNorm = n;
    out += p;
  }
  // Ardışık üçten fazla boş satırı ikiye indir.
  return out.replace(/\n{3,}/g, "\n\n");
}

/**
 * Tekrar/döngü temizliği. Kod bloklarını korur.
 * @param {string} text
 * @returns {string}
 */
function collapseRepetition(text) {
  const src = String(text || "");
  if (!src.trim()) return src;
  // ```...``` bloklarını böl; kod segmentlerine dokunma.
  const parts = src.split(/(```[\s\S]*?```)/g);
  return parts.map((seg) => (seg.startsWith("```") ? seg : collapseProse(seg))).join("").trim();
}

/**
 * Metin "kaçak tekrar" içeriyor mu? (uzun bir cümle 3+ kez) — teşhis/telemetri için.
 * @param {string} text
 * @returns {boolean}
 */
function detectRunawayRepetition(text) {
  const counts = new Map();
  for (const raw of String(text || "").split(/\n+|(?<=[.!?])\s+/)) {
    const n = norm(raw);
    if (n.length < MIN_DEDUP_LEN) continue;
    const c = (counts.get(n) || 0) + 1;
    counts.set(n, c);
    if (c >= 3) return true;
  }
  return false;
}

module.exports = { collapseRepetition, detectRunawayRepetition, norm };
