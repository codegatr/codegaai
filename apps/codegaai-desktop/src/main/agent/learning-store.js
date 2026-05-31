"use strict";
/**
 * agent/learning-store.js
 * ------------------------
 * Sürekli öğrenmeyle toplanan bilgi notlarını kalıcı tutar (kişisel hafızadan ayrı).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const MAX_NOTES = 300;

function storePath() {
  if (process.env.CODEGA_LEARNING_PATH) return process.env.CODEGA_LEARNING_PATH;
  return path.join(os.homedir(), ".codega-learning.json");
}

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(storePath(), "utf8"));
    return { notes: Array.isArray(d.notes) ? d.notes : [], topics: Array.isArray(d.topics) ? d.topics : [] };
  } catch (_e) {
    return { notes: [], topics: [] };
  }
}
function save(d) {
  try { fs.writeFileSync(storePath(), JSON.stringify(d, null, 2)); } catch (_e) {}
}

function keyOf(n) {
  return `${n.source}|${n.topic}|${String(n.text).slice(0, 60)}`.toLowerCase();
}

/** Yeni notları ekle (tekrarları atla). Eklenen sayısını döndürür. */
function addNotes(notes) {
  const d = load();
  const seen = new Set(d.notes.map(keyOf));
  let added = 0;
  for (const n of notes || []) {
    const k = keyOf(n);
    if (seen.has(k)) continue;
    seen.add(k);
    d.notes.push(n);
    added += 1;
  }
  if (d.notes.length > MAX_NOTES) d.notes = d.notes.slice(-MAX_NOTES);
  if (added) save(d);
  return added;
}

function list(limit = 50) {
  return load().notes.slice(-limit).reverse();
}
function count() {
  return load().notes.length;
}
function clearAll() {
  save({ notes: [], topics: [] });
}

/** Konuşmalardan türetilen konu tohumunu havuza ekle (ajan kendi konusunu bulsun). */
function addTopic(topic) {
  const t = String(topic || "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (t.length < 3) return false;
  const d = load();
  const low = t.toLowerCase();
  if (d.topics.some((x) => String(x).toLowerCase() === low)) return false;
  d.topics.push(t);
  if (d.topics.length > 60) d.topics = d.topics.slice(-60);
  save(d);
  return true;
}
function getTopics(limit = 12) {
  return load().topics.slice(-limit);
}

/** Öğrenilen notlarda anahtar-kelime skoruyla ara (cevaba bağlam katmak için). */
function searchLearned(query, limit = 3) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return [];
  const terms = q.split(/\s+/).filter((w) => w.length > 2);
  if (!terms.length) return [];
  const notes = load().notes;
  return notes
    .map((n) => {
      const hay = `${n.topic} ${n.text}`.toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      return { n, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({ source: x.n.source, topic: x.n.topic, text: x.n.text, url: x.n.url }));
}

function _cos(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/** Anlamsal arama: sorgu vektörüne en yakın (embedding'i olan) notlar. */
function searchSemantic(queryVec, limit = 3, minScore = 0.3) {
  if (!Array.isArray(queryVec)) return [];
  const notes = load().notes;
  return notes
    .filter((n) => Array.isArray(n.emb))
    .map((n) => ({ n, score: _cos(queryVec, n.emb) }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({ source: x.n.source, topic: x.n.topic, text: x.n.text, url: x.n.url, score: x.score }));
}

/** Embedding'i olmayan notları (verilen embedFn ile) vektörle; eklenen sayıyı döndür.
 *  embedFn(text) -> vektör|null. Ağ/Ollama burada DI ile gelir (depo ağ bilmez). */
async function backfillEmbeddings(embedFn, limit = 5) {
  const d = load();
  let done = 0;
  for (const n of d.notes) {
    if (done >= limit) break;
    if (Array.isArray(n.emb)) continue;
    try {
      const v = await embedFn(`${n.topic}. ${n.text}`);
      if (Array.isArray(v) && v.length) { n.emb = v; done += 1; }
    } catch (_e) { /* atla */ }
  }
  if (done) save(d);
  return done;
}

function embeddedCount() {
  return load().notes.filter((n) => Array.isArray(n.emb)).length;
}

module.exports = { addNotes, list, count, clearAll, storePath, addTopic, getTopics, searchLearned, searchSemantic, backfillEmbeddings, embeddedCount };
