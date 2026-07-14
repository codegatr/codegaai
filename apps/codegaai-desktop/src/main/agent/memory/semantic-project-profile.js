"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const embeddings = require("../embeddings");

const PROFILE_FILE = ".codegaai.json";
const PROFILE_VERSION = 2;
const MAX_MEMORIES = 200;

function normalizeRoot(root) {
  const value = String(root || "").trim();
  if (!value) return "";
  return path.resolve(value);
}

function profilePath(projectRoot) {
  const root = normalizeRoot(projectRoot);
  if (!root) return "";
  const target = path.resolve(root, PROFILE_FILE);
  const compareRoot = process.platform === "win32" ? root.toLowerCase() : root;
  const compareTarget = process.platform === "win32" ? target.toLowerCase() : target;
  if (compareTarget !== path.join(compareRoot, PROFILE_FILE)) {
    throw new Error("Invalid CODEGA project profile path.");
  }
  return target;
}

function emptyProfile() {
  return {
    version: PROFILE_VERSION,
    updatedAt: new Date(0).toISOString(),
    facts: {
      architectureRules: [],
      forbiddenLibraries: [],
      environment: [],
      styleRules: [],
      guardrails: [],
    },
    memories: [],
  };
}

function normalizeList(values, limit = 20) {
  const source = Array.isArray(values) ? values : [];
  const seen = new Set();
  const out = [];
  for (const item of source) {
    const text = String(item || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text.slice(0, 240));
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeProfile(profile) {
  const base = emptyProfile();
  const facts = (profile && profile.facts) || {};
  return {
    version: PROFILE_VERSION,
    updatedAt: String((profile && profile.updatedAt) || base.updatedAt),
    facts: {
      architectureRules: normalizeList([...(base.facts.architectureRules || []), ...(facts.architectureRules || [])]),
      forbiddenLibraries: normalizeList([...(base.facts.forbiddenLibraries || []), ...(facts.forbiddenLibraries || [])]),
      environment: normalizeList([...(base.facts.environment || []), ...(facts.environment || [])]),
      styleRules: normalizeList([...(base.facts.styleRules || []), ...(facts.styleRules || [])]),
      guardrails: normalizeList([...(base.facts.guardrails || []), ...(facts.guardrails || [])]),
    },
    memories: normalizeMemories(profile && profile.memories),
  };
}

function normalizeMemories(values) {
  const source = Array.isArray(values) ? values : [];
  const seen = new Set();
  const out = [];
  for (const item of source) {
    const text = String(item && item.text || "").replace(/\s+/g, " ").trim().slice(0, 500);
    if (!text || containsSecret(text)) continue;
    const id = String(item.id || memoryId(text));
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      text,
      kind: String(item.kind || "engineering_fact").slice(0, 40),
      source: String(item.source || "project_profile").slice(0, 80),
      confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0.8)),
      createdAt: String(item.createdAt || new Date(0).toISOString()),
      embedding: Array.isArray(item.embedding) ? item.embedding.filter(Number.isFinite) : null,
    });
  }
  return out.slice(-MAX_MEMORIES);
}

function containsSecret(text) {
  return /(?:sk-[A-Za-z0-9_-]{12,}|api[_-]?key\s*[:=]|token\s*[:=]|password\s*[:=]|secret\s*[:=]|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(String(text || ""));
}

function memoryId(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex").slice(0, 20);
}

function writeProfile(projectRoot, profile) {
  const p = profilePath(projectRoot);
  if (!p) throw new Error("Project root is required.");
  const next = normalizeProfile(profile);
  next.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const temporary = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(temporary, p);
  return next;
}

function loadSemanticProjectProfile(projectRoot) {
  const p = profilePath(projectRoot);
  if (!p) return emptyProfile();
  try {
    return normalizeProfile(JSON.parse(fs.readFileSync(p, "utf8")));
  } catch (_e) {
    return emptyProfile();
  }
}

function mergeFacts(current, patch) {
  const next = normalizeProfile(current);
  const incoming = (patch && patch.facts) || patch || {};
  for (const key of Object.keys(next.facts)) {
    next.facts[key] = normalizeList([...(next.facts[key] || []), ...(incoming[key] || [])]);
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

function saveSemanticProjectProfile(projectRoot, patch) {
  const p = profilePath(projectRoot);
  if (!p) throw new Error("Project root is required.");
  const current = loadSemanticProjectProfile(projectRoot);
  const next = mergeFacts(current, patch);
  return writeProfile(projectRoot, next);
}

function factEntries(facts) {
  const source = facts && facts.facts ? facts.facts : facts || {};
  const entries = [];
  for (const [kind, values] of Object.entries(source)) {
    for (const text of normalizeList(values, 20)) entries.push({ kind, text });
  }
  return entries;
}

async function rememberProjectSemanticFacts(projectRoot, facts, opts = {}) {
  const embeddingAvailable = opts.embedFn ? true : await embeddings.available(opts.embeddingOptions || {});
  const embedFn = opts.embedFn || (embeddingAvailable ? embeddings.embed : async () => null);
  const current = loadSemanticProjectProfile(projectRoot);
  const known = new Set(current.memories.map((item) => item.id));
  let added = 0;
  for (const entry of factEntries(facts)) {
    if (containsSecret(entry.text)) continue;
    const id = memoryId(entry.text);
    if (known.has(id)) continue;
    let embedding = null;
    try { embedding = await embedFn(entry.text, opts.embeddingOptions || {}); } catch (_e) {}
    current.memories.push({
      id,
      text: entry.text,
      kind: entry.kind,
      source: "project_profile",
      confidence: 0.9,
      createdAt: new Date().toISOString(),
      embedding: Array.isArray(embedding) ? embedding : null,
    });
    known.add(id);
    added += 1;
  }
  if (added) writeProfile(projectRoot, current);
  return { added, total: current.memories.length };
}

function keywordSimilarity(query, text) {
  const terms = new Set(String(query || "").toLowerCase().match(/[a-z0-9_]{3,}/g) || []);
  if (!terms.size) return 0;
  const haystack = String(text || "").toLowerCase();
  let matches = 0;
  for (const term of terms) if (haystack.includes(term)) matches += 1;
  return matches / terms.size;
}

async function recallProjectSemanticMemory(projectRoot, query, opts = {}) {
  const profile = loadSemanticProjectProfile(projectRoot);
  if (!profile.memories.length) return { items: [], context: "", mode: "empty" };
  const embeddingAvailable = opts.embedFn ? true : await embeddings.available(opts.embeddingOptions || {});
  const embedFn = opts.embedFn || (embeddingAvailable ? embeddings.embed : async () => null);
  let queryEmbedding = null;
  try { queryEmbedding = await embedFn(String(query || ""), opts.embeddingOptions || {}); } catch (_e) {}
  const scored = profile.memories.map((item) => {
    const vectorScore = Array.isArray(queryEmbedding) && Array.isArray(item.embedding)
      ? embeddings.cosine(queryEmbedding, item.embedding)
      : 0;
    const keywordScore = keywordSimilarity(query, item.text);
    return { ...item, score: Math.max(vectorScore, keywordScore) * item.confidence };
  }).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(10, Number(opts.limit) || 5)));
  const context = scored.length
    ? ["RECALLED PROJECT MEMORY (local, evidence-ranked):", ...scored.map((item) => `- [${item.kind}; ${item.score.toFixed(3)}] ${item.text}`)].join("\n")
    : "";
  return { items: scored, context, mode: Array.isArray(queryEmbedding) ? "vector" : "keyword" };
}

function extractProjectProfileFacts(text) {
  const value = String(text || "");
  const facts = {
    architectureRules: [],
    forbiddenLibraries: [],
    environment: [],
    styleRules: [],
    guardrails: [],
  };
  const add = (key, fact) => facts[key].push(fact);
  if (/local-first|privacy-first/i.test(value)) add("architectureRules", "CODEGA AI must stay local-first and privacy-first.");
  if (/multi-model|Claude|OpenAI|Gemini|Ollama/i.test(value)) add("architectureRules", "Model routing must support Ollama plus Claude/OpenAI/Gemini cloud providers.");
  if (/DirectAdmin|shared hosting|low-resource/i.test(value)) add("environment", "DirectAdmin and low-resource shared hosting constraints matter for generated software.");
  if (/Laravel|React|framework/i.test(value) && /framework'?s[uü]z|frameworkless|vanilla|procedural PHP/i.test(value)) {
    add("forbiddenLibraries", "When frameworkless output is requested, avoid Laravel, React, and heavy external frameworks.");
  }
  if (/PDO|bindParam|prepared/i.test(value)) add("guardrails", "Database code must use PDO prepared statements and bindParam when requested.");
  if (/ON\s+JOIN|char_salad|karakter salatas/i.test(value)) add("guardrails", "Abort and quarantine char_salad, ON JOIN, JOIN(...), dangling alias, and placeholder output.");
  if (/Turkish|T[uü]rk[cç]e/i.test(value)) add("styleRules", "User-facing explanations should be clear Turkish; code identifiers stay ASCII/English.");
  return facts;
}

function buildProjectProfileContext(profile) {
  const normalized = normalizeProfile(profile);
  const lines = ["PROJECT SEMANTIC PROFILE:"];
  for (const [key, values] of Object.entries(normalized.facts)) {
    if (!values.length) continue;
    lines.push(`${key}:`);
    values.slice(-8).forEach((item) => lines.push(`- ${item}`));
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

module.exports = {
  PROFILE_FILE,
  PROFILE_VERSION,
  profilePath,
  emptyProfile,
  normalizeProfile,
  loadSemanticProjectProfile,
  saveSemanticProjectProfile,
  extractProjectProfileFacts,
  buildProjectProfileContext,
  rememberProjectSemanticFacts,
  recallProjectSemanticMemory,
  keywordSimilarity,
  containsSecret,
};
