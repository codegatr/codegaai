"use strict";
/**
 * agent/rag.js
 * -------------
 * Yerel RAG (Retrieval-Augmented Generation) motoru.
 *
 * - Doküman/bilgi metnini parçalara böler (chunk), Ollama embeddings ile gömer,
 *   yerel bir vektör deposunda (JSON) tutar.
 * - Sorguda en alakalı parçaları kosinüs benzerliğiyle getirir.
 * - Embedding modeli yoksa anahtar-kelime fallback'i ile yine de çalışır.
 *
 * Tamamen yerel; ağ yalnızca yerel Ollama'ya (127.0.0.1) gider.
 * cosineSimilarity / chunkText / keyword fallback saf fonksiyonlar → test edilebilir.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { getSettings } = require("./settings-store");
const { ollamaReachable, OLLAMA_HOST } = require("./ollama-client");

function storePath() {
  if (process.env.CODEGA_RAG_PATH) return process.env.CODEGA_RAG_PATH;
  return path.join(os.homedir(), ".codega-ai", "rag-store.json");
}

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(storePath(), "utf8"));
    return Array.isArray(d.items) ? d : { items: [] };
  } catch (_e) {
    return { items: [] };
  }
}

function save(data) {
  const p = storePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data), "utf8");
}

// --- saf yardımcılar (test edilebilir) ---

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function chunkText(text, size = 800, overlap = 150) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const chunks = [];
  let i = 0;
  while (i < clean.length) {
    chunks.push(clean.slice(i, i + size));
    i += size - overlap;
  }
  return chunks;
}

function keywordScore(query, text) {
  const q = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const t = String(text || "").toLowerCase();
  if (!q.length) return 0;
  return q.reduce((s, term) => s + (t.includes(term) ? 1 : 0), 0) / q.length;
}

// --- Ollama embedding ---

async function embed(text) {
  const s = getSettings();
  const model = s.embedModel || "nomic-embed-text";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: String(text || "") }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.embedding) ? data.embedding : null;
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// --- public API ---

/** Bir doküman/bilgi metnini parçalayıp (mümkünse gömerek) depoya ekle. */
async function addDocument(title, text, meta = {}) {
  const chunks = chunkText(text);
  if (!chunks.length) return { ok: false, added: 0 };
  const data = load();
  const docId = `doc_${Date.now()}`;
  const reachable = await ollamaReachable();
  let added = 0;
  for (let idx = 0; idx < chunks.length; idx++) {
    const chunk = chunks[idx];
    let embedding = null;
    if (reachable) embedding = await embed(chunk);
    data.items.push({
      id: `${docId}_${idx}`,
      docId,
      title: String(title || "Doküman"),
      text: chunk,
      embedding, // null ise keyword fallback kullanılır
      meta,
      at: Date.now(),
    });
    added += 1;
  }
  save(data);
  return { ok: true, added, embedded: reachable };
}

/** Sorguya en alakalı parçaları getir (embedding varsa kosinüs, yoksa keyword). */
async function search(query, k = 4) {
  const data = load();
  if (!data.items.length) return [];
  const qEmb = (await ollamaReachable()) ? await embed(query) : null;

  const scored = data.items.map((item) => {
    let score;
    if (qEmb && Array.isArray(item.embedding)) {
      score = cosineSimilarity(qEmb, item.embedding);
    } else {
      score = keywordScore(query, item.text);
    }
    return { title: item.title, text: item.text, score };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

function stats() {
  const data = load();
  const docs = new Set(data.items.map((i) => i.docId));
  const embedded = data.items.filter((i) => Array.isArray(i.embedding)).length;
  return { chunks: data.items.length, documents: docs.size, embedded };
}

function clearAll() {
  save({ items: [] });
  return true;
}

module.exports = {
  addDocument,
  search,
  stats,
  clearAll,
  // test edilebilir saf fonksiyonlar:
  cosineSimilarity,
  chunkText,
  keywordScore,
  storePath,
};
