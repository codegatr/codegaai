"use strict";
/**
 * Reference Resolver — Referans Çözücü
 * "devam et", "bunu yap", "tamam", "continue", "this" gibi
 * belirsiz ifadeleri aktif graph context'ine bakarak çözer.
 *
 * Kullanıcı hiçbir zaman bağlam yinelemek zorunda kalmamalı.
 */
const { REFERENCE_SIGNALS } = require("./cognitive-types");

// Türkçe + İngilizce referans kalıpları
const DEVAM_PATTERNS    = /^(devam\s*et|devam|continue|proceed|go\s*on|keep\s*going|next|ileri)\.?$/i;
const BUNU_PATTERNS     = /^(bunu\s*(yap|uygula|ekle|düzelt|tamamla)?|bunu|bune|this|that|it|do\s*it|apply|implement\s*(it|this)?)\.?$/i;
const TAMAM_PATTERNS    = /^(tamam[ı]?|tamamdır|olur|evet|yes|ok(ay)?|sure|got\s*it|anladım|anlıyorum)\.?$/i;
const ONAY_PATTERNS     = /^(onayla|approve|confirm|\+1|👍|✅)\.?$/i;

/**
 * Bir mesajın hangi referans türünü taşıdığını belirler.
 * @returns { type: 'devam'|'bunu'|'tamam'|'onay'|'mixed'|null, confidence: number }
 */
function detectReferenceType(message) {
  const m = String(message || "").trim();
  if (!m) return { type: null, confidence: 0 };

  // Tam eşleşme önce
  if (DEVAM_PATTERNS.test(m)) return { type: "devam", confidence: 1.0 };
  if (BUNU_PATTERNS.test(m))  return { type: "bunu",  confidence: 1.0 };
  if (TAMAM_PATTERNS.test(m)) return { type: "tamam", confidence: 1.0 };
  if (ONAY_PATTERNS.test(m))  return { type: "onay",  confidence: 1.0 };

  // Kısmi eşleşme
  const lower = m.toLowerCase();
  const signals = [...REFERENCE_SIGNALS].filter(s => lower.includes(s));
  if (!signals.length) return { type: null, confidence: 0 };

  const hasDevam  = signals.some(s => ["devam","continue","proceed","next"].includes(s));
  const hasBunu   = signals.some(s => ["bunu","this","that","it"].includes(s));
  const hasTamam  = signals.some(s => ["tamam","evet","ok","yes"].includes(s));

  if (hasDevam && hasBunu) return { type: "mixed",  confidence: 0.7 };
  if (hasDevam)            return { type: "devam",  confidence: 0.6 };
  if (hasBunu)             return { type: "bunu",   confidence: 0.6 };
  if (hasTamam)            return { type: "tamam",  confidence: 0.5 };

  return { type: null, confidence: 0 };
}

/**
 * WorkingMemory ve LifeGraph context'inden referansı çözer.
 * @param {string}  message       — kullanıcı mesajı
 * @param {object}  workingMemory — WorkingMemory instance
 * @param {object}  lifeGraph     — LifeGraph instance
 * @returns {{ resolved: boolean, expandedMessage: string, context: object, type: string|null }}
 */
function resolveReference(message, workingMemory, lifeGraph) {
  const { type, confidence } = detectReferenceType(message);

  if (!type || confidence < 0.5) {
    return { resolved: false, expandedMessage: message, context: {}, type: null };
  }

  const wm      = workingMemory?.snapshot?.() || {};
  const project = wm.activeProject;
  const mission = wm.activeMission;
  const task    = wm.currentTask;
  const chain   = (wm.reasoningChain || []).slice(-2);

  const ctx = { type, confidence, project, mission, task, recentReasoning: chain };

  let expandedMessage = message;

  switch (type) {
    case "devam":
      if (task)    expandedMessage = `${task} göreviyle devam et.`;
      else if (mission) expandedMessage = `"${mission}" misyonuyla devam et.`;
      else if (project) expandedMessage = `${project} projesindeki son işle devam et.`;
      else         expandedMessage = `En son bıraktığımız yerden devam et.`;
      break;

    case "bunu":
      if (chain.length) {
        expandedMessage = `${chain[chain.length-1]} — bunu uygula/tamamla.`;
      } else if (task) {
        expandedMessage = `"${task}" görevini uygula.`;
      }
      break;

    case "tamam":
    case "onay":
      if (task)    expandedMessage = `"${task}" için onay verildi. Devam et.`;
      else if (mission) expandedMessage = `"${mission}" misyonu onaylandı.`;
      else         expandedMessage = `Onaylandı. Devam et.`;
      break;

    case "mixed":
      if (task)    expandedMessage = `${task} göreviyle devam et ve uygula.`;
      else if (mission) expandedMessage = `"${mission}" misyonuyla devam et.`;
      break;
  }

  return { resolved: true, expandedMessage, context: ctx, type };
}

/**
 * Bir mesajın referans içerip içermediğini hızlıca kontrol eder.
 */
function isReferenceMessage(message) {
  return detectReferenceType(message).confidence > 0;
}

module.exports = { resolveReference, detectReferenceType, isReferenceMessage };
