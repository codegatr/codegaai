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
  return { bad: false, reason: "" };
}

module.exports = { looksDegenerate, META_RE };
