"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PROFILE_FILE = ".codegaai.json";
const PROFILE_VERSION = 1;

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
  };
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
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(next, null, 2), "utf8");
  return next;
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
};
