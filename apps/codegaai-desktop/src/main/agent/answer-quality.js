"use strict";

/**
 * answer-quality.js — Ucuz, model-çağırmayan "cevap bozuk mu?" sezici.
 *
 * Varsayılan yolun (askDirect) ÖZ-DÜZELTMESİ için: küçük model bazen boş, kendini
 * tekrar eden veya "kendiyle konuşan" (rol karışması) çöp üretir. Bunu ek maliyet
 * OLMADAN yakalayıp çağırana "bir kez düzelt" sinyali veririz. Saf + test edilebilir.
 */

const { detectRunawayRepetition } = require("./anti-loop");

// Rol karışması / kendiyle konuşma imzaları (4B dejenerasyonunda sık görülür).
const META_RE = /benim yan[ıi]t[ıi]m[ıi]\s*bekl|sizin taraf[ıi]n[ıi]za\s*ge[çc]|hangi yolu izl(iyorsun|eyebilir)|emin olamad[ıi][ğg][ıi]m nokta|biz hep birlikte yapt|nas[ıi]l yard[ıi]mc[ıi] olabilir(im)?|siz bana sordu|sizden ne bekleniyor|neredesiniz biz sizinle/gi;

// Karakter salatası: model unicode/emoji/yabancı-alfabe uzayına savrulup rastgele
// simge yığını veya klavye-ezmesi ("qwertyuiop...") üretmiş mi? (tekcanmetal örneği)
function hasCharSalad(text) {
  const a = String(text || "");
  if (a.length < 40) return false;
  // 1) Anormal uzun boşluksuz dizi (URL değilse) → klavye/unicode ezmesi.
  const longestRun = a.split(/\s+/)
    .filter((w) => !/^https?:\/\//i.test(w))
    .reduce((m, w) => Math.max(m, w.length), 0);
  if (longestRun > 45) return true;
  // 2) Beklenmeyen karakter (latin+türkçe+rakam+yaygın noktalama dışı) yoğunluğu.
  let junk = 0, total = 0;
  for (const ch of a) {
    if (/\s/.test(ch)) continue;
    total++;
    if (/[a-zA-Z0-9çğıöşüÇĞİÖŞÜ.,;:!?'"()\-\/%…&@#+*=\[\]{}<>|_₺$€]/.test(ch)) continue;
    junk++;
  }
  return total >= 40 && junk / total > 0.22;
}

/**
 * @param {string} answer   modelin ürettiği yanıt
 * @param {string} [question] kullanıcı sorusu (bağlam; şimdilik yalnız uzunluk kıyası)
 * @returns {{bad:boolean, reason:string}}
 */
function looksDegenerate(answer, question = "") {
  const a = String(answer || "").trim();
  if (!a) return { bad: true, reason: "empty" };
  if (detectRunawayRepetition(a)) return { bad: true, reason: "runaway_repetition" };
  const metaHits = (a.match(META_RE) || []).length;
  if (metaHits >= 2) return { bad: true, reason: "role_confusion" };
  if (hasCharSalad(a)) return { bad: true, reason: "char_salad" };
  return { bad: false, reason: "" };
}

module.exports = { looksDegenerate, hasCharSalad, META_RE };
