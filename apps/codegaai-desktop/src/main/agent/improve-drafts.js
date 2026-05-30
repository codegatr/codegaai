"use strict";
/**
 * agent/improve-drafts.js
 * ------------------------
 * Ajan açıkken kendi sorunlarını GÖZLEMLER ve iyileştirme önerisi TASLAKLARI
 * biriktirir. Taslaklar YEREL kalır — kendiliğinden PR açılmaz, gönderilmez.
 * Kullanıcı bir taslağı seçip tek tıkla PR olarak açar (insan onayı korunur).
 *
 * recordSignal: bir gözlem say (tool hatası, boş yanıt, depo onarımı, ollama kopması).
 * buildDrafts: eşik aşan sinyalleri okunur önerilere dönüştürür (saf → test edilebilir).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

function storePath() {
  if (process.env.CODEGA_IMPROVE_PATH) return process.env.CODEGA_IMPROVE_PATH;
  return path.join(os.homedir(), ".codega-improve.json");
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(storePath(), "utf8")) || {};
  } catch (_e) {
    return {};
  }
}
function save(data) {
  try {
    fs.writeFileSync(storePath(), JSON.stringify(data, null, 2));
  } catch (_e) {
    /* kayıt hatası akışı bozmasın */
  }
}

function recordSignal({ kind, subject = "" } = {}) {
  if (!kind) return;
  const data = load();
  const key = subject ? `${kind}:${subject}` : kind;
  const cur = data[key] || { kind, subject, count: 0 };
  cur.count += 1;
  cur.lastSeen = Date.now();
  data[key] = cur;
  save(data);
}

const THRESHOLDS = { tool_error: 3, empty_response: 3, ollama_down: 3, store_repair: 1 };

function draftFor(sig) {
  const s = sig.subject;
  switch (sig.kind) {
    case "tool_error":
      return {
        idea: `'${s}' aracı sık hata veriyor`,
        rationale: `Son kullanımlarda ${sig.count} kez hata döndü. Aracın çağrı biçimi/zaman aşımı/argüman doğrulaması gözden geçirilebilir.`,
      };
    case "empty_response":
      return {
        idea: "Model sık sık boş/başarısız yanıt veriyor",
        rationale: `${sig.count} kez boş yanıt gözlendi. Daha küçük bağlam, farklı model (örn. qwen3:8b) veya Ollama sağlık kontrolü değerlendirilebilir.`,
      };
    case "ollama_down":
      return {
        idea: "Ollama bağlantısı sık kopuyor",
        rationale: `${sig.count} kez erişilemedi. Otomatik yeniden bağlanma/uyarı ve daha net kullanıcı bildirimi eklenebilir.`,
      };
    case "store_repair":
      return {
        idea: `'${s}' veri dosyası bozulmuştu`,
        rationale: `${sig.count} kez onarım gerekti. Yazma sırasında atomik kayıt (geçici dosya + yeniden adlandırma) eklenmesi düşünülebilir.`,
      };
    default:
      return { idea: `${sig.kind} gözlemi`, rationale: `${sig.count} kez gözlendi.` };
  }
}

/** Eşik aşan sinyalleri öneri taslaklarına çevir (saf). */
function buildDrafts(signals, thresholds = THRESHOLDS) {
  const out = [];
  for (const sig of Object.values(signals || {})) {
    const limit = thresholds[sig.kind] || 3;
    if ((sig.count || 0) >= limit) {
      const d = draftFor(sig);
      out.push({ kind: sig.kind, subject: sig.subject || "", count: sig.count, ...d });
    }
  }
  // en çok tekrarlayan önce
  return out.sort((a, b) => b.count - a.count);
}

function getDrafts() {
  return buildDrafts(load());
}
function clearAll() {
  save({});
}
function listSignals() {
  return load();
}

module.exports = { recordSignal, buildDrafts, getDrafts, clearAll, listSignals, storePath };
