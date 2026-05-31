"use strict";
/**
 * agent/embeddings.js
 * --------------------
 * Ollama embedding ucuyla metni vektöre çevirir (anlamsal arama için).
 * Embedding modeli yoksa/Ollama kapalıysa null döner -> çağıran anahtar-kelimeye düşer.
 *
 * Kurulum: `ollama pull nomic-embed-text`
 */

const DEFAULT_EMBED_MODEL = "nomic-embed-text";

function host(opts = {}) {
  return opts.host || process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
}

async function fetchJson(url, bodyObj, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Metni vektöre çevir; başarısızsa null. */
async function embed(text, opts = {}) {
  const t = String(text || "").trim();
  if (!t) return null;
  const model = opts.model || DEFAULT_EMBED_MODEL;
  const timeoutMs = opts.timeoutMs || 15000;
  const h = host(opts);
  // Yeni uç: /api/embed -> { embeddings: [[...]] }
  let r = await fetchJson(`${h}/api/embed`, { model, input: t }, timeoutMs);
  if (r && Array.isArray(r.embeddings) && Array.isArray(r.embeddings[0])) return r.embeddings[0];
  if (r && Array.isArray(r.embedding)) return r.embedding;
  // Eski uç: /api/embeddings -> { embedding: [...] }
  r = await fetchJson(`${h}/api/embeddings`, { model, prompt: t }, timeoutMs);
  if (r && Array.isArray(r.embedding)) return r.embedding;
  return null;
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Modelin kurulu olup olmadığını TTL ile önbellekle (her turda /api/tags çağırma)
let _availCache = { at: 0, ok: false };
async function available(opts = {}) {
  const now = Date.now();
  if (now - _availCache.at < 60 * 1000) return _availCache.ok;
  const model = opts.model || DEFAULT_EMBED_MODEL;
  let ok = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${host(opts)}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      const names = ((data && data.models) || []).map((m) => String(m.name || ""));
      ok = names.some((n) => n === model || n.startsWith(model + ":") || n.startsWith(model));
    }
  } catch (_e) {
    ok = false;
  }
  _availCache = { at: now, ok };
  return ok;
}

module.exports = { embed, cosine, available, DEFAULT_EMBED_MODEL };
